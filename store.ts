/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";
import { Toasts } from "@webpack/common";

import { prefix, settings } from "./settings";
import { CategoriesPageInstance, Format, StoredCategory, StoredGif } from "./types";
import { dispatchPickerQuery, GIF_HOST_RE } from "./utils";

export const logger = new Logger("GifOrganizer");

const DATA_KEY = "GifOrganizer_categories";
export const ITEM_PREFIX = "vgo-item:";

export let categories: StoredCategory[] = [];

/** Live references into the picker so we can refresh it after changes */
export const uiRefs = {
    categoriesPage: null as CategoriesPageInstance | null,
    /** the picker's results component (holds state.resultType) - used to open Favorites */
    pickerRoot: null as unknown,
    /** full query (with prefix) of the category view currently open, if any */
    lastCategoryQuery: null as string | null,
    /** set by chat.tsx; rebuilds the bookmarks sidebar after data changes */
    refreshSidebar: null as (() => void) | null
};

/** Built-in bookmark icons (24x24 single paths, fill = currentColor) */
export const BUILTIN_ICONS: Record<string, string> = {
    star: "M12 2l2.9 6.26 6.6.56-5 4.36 1.5 6.45L12 16.9 5.99 19.63l1.5-6.45-5-4.36 6.6-.56L12 2z",
    heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    flame: "M12 2c1 3-1 4.5-1 7 0 1 .8 2 2 2s2-1 2-2.3C16.5 10 18 12 18 14.5A6 6 0 0 1 6 14.5C6 9 12 8 12 2Z",
    bolt: "M13 2 4.09 12.35a.5.5 0 0 0 .38.82H11l-1 8.83 8.91-10.35a.5.5 0 0 0-.38-.82H13L13 2Z",
    folder: "M2 5a2 2 0 0 1 2-2h4.59a2 2 0 0 1 1.41.59L11.41 5H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Z",
    paw: "M12 12.5c2.5 0 5.5 2 5.5 4.5 0 1.7-1.3 3-3 3-1 0-1.7-.5-2.5-.5s-1.5.5-2.5.5c-1.7 0-3-1.3-3-3 0-2.5 3-4.5 5.5-4.5ZM5 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm14 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
    note: "M9 3v10.55A4 4 0 1 0 11 17V7h8V3H9Z",
    ghost: "M12 2a8 8 0 0 0-8 8v11l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10a8 8 0 0 0-8-8Zm-3 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"
};

const VIDEO_EXTENSIONS = ["mp4", "ogg", "webm", "avi", "wmv", "flv", "mov", "mkv", "m4v"];

export function getFormat(url: string): Format {
    const ext = url?.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
    return ext && VIDEO_EXTENSIONS.includes(ext) ? Format.VIDEO : Format.IMAGE;
}

export async function initStore() {
    try {
        categories = (await DataStore.get<StoredCategory[]>(DATA_KEY)) ?? [];
    } catch (err) {
        // don't let a read failure abort the whole plugin start silently -
        // fall back to an empty list and surface the problem instead
        logger.error("Failed to load categories from DataStore", err);
        categories = [];
    }
}

const SAVE_ERROR = "Couldn't save your categories - the last change was reverted";

/**
 * Persist the current categories. On failure, restore the pre-change snapshot
 * so the in-memory state can't silently diverge from what's stored, log the
 * error, and tell the user. Never rejects; returns whether the write succeeded.
 */
async function save(rollback: StoredCategory[]): Promise<boolean> {
    try {
        await DataStore.set(DATA_KEY, categories);
    } catch (err) {
        logger.error("Failed to persist categories", err);
        categories = rollback;
        toast(SAVE_ERROR);
        refreshUI();
        return false;
    }
    refreshUI();
    return true;
}

function toast(message: string, success = false) {
    Toasts.show({
        message,
        type: success ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE,
        id: Toasts.genId(),
        options: { duration: 2500, position: Toasts.Position.BOTTOM }
    });
}

/** Re-render the front page cards and, if a category view is open, re-run its query */
export function refreshUI(deletedName?: string) {
    uiRefs.categoriesPage?.forceUpdate();
    uiRefs.refreshSidebar?.();

    const q = uiRefs.lastCategoryQuery;
    if (!q) return;

    if (deletedName != null && q === prefix() + deletedName) {
        uiRefs.lastCategoryQuery = null;
        dispatchPickerQuery("");
        return;
    }

    // re-dispatch the open category query so its grid refreshes
    dispatchPickerQuery("");
    dispatchPickerQuery(q);
}

export function findCategory(name: string) {
    return categories.find(c => c.name === name);
}

export function sortedCategories(): StoredCategory[] {
    const sorted = [...categories];
    switch (settings.store.cardSort) {
        case "updated":
            return sorted.sort((a, b) => b.lastUpdated - a.lastUpdated);
        case "created":
            return sorted.sort((a, b) => b.createdAt - a.createdAt);
        default:
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
}

export function categoriesContaining(url: string): StoredCategory[] {
    return categories.filter(c => c.gifs.some(g => g.url === url));
}

/**
 * Kind of a stored item. Anything traceable to Tenor/Giphy is a GIF - checked
 * against the full src AND url, because Discord proxies Tenor media through
 * images-ext-X.discordapp.net/external/.../media.tenor.com/... (the original
 * host survives in the path). This also overrides items mis-tagged earlier.
 */
export function inferKind(g: StoredGif): "gif" | "video" {
    if ((g.format ?? getFormat(g.src)) !== Format.VIDEO) return "gif";
    if (GIF_HOST_RE.test(g.src) || GIF_HOST_RE.test(g.url)) return "gif";
    return g.kind ?? "video";
}

function validateName(name: string): string | null {
    if (!name) return "Category name can't be empty";
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase()))
        return "A category with that name already exists";
    return null;
}

export interface GifInput {
    src: string;
    url: string;
    width?: number;
    height?: number;
    format?: Format;
    kind?: "gif" | "video";
}

function makeStoredGif(gif: GifInput): StoredGif {
    // when re-saving an item we already know (e.g. from a category view tile),
    // inherit its kind so videos stay marked as videos
    const known = categories.flatMap(c => c.gifs).find(g => g.url === gif.url)?.kind;
    return {
        id: ITEM_PREFIX + crypto.randomUUID(),
        src: gif.src,
        url: gif.url,
        width: gif.width ?? 0,
        height: gif.height ?? 0,
        format: gif.format ?? getFormat(gif.src),
        kind: gif.kind ?? known ?? "gif",
        addedAt: Date.now()
    };
}

function updateThumb(cat: StoredCategory) {
    const latest = cat.gifs[cat.gifs.length - 1];
    cat.src = latest?.src ?? settings.store.emptyCategoryImage;
    cat.format = latest ? latest.format : getFormat(cat.src);
    cat.lastUpdated = Date.now();
}

/** @returns error message or null on success */
export async function createCategory(name: string, gif?: GifInput): Promise<string | null> {
    name = name.trim();
    const err = validateName(name);
    if (err) return err;

    if (gif && settings.store.exclusiveMode) {
        const existing = categoriesContaining(gif.url)[0];
        if (existing) return `Exclusive mode: this item is already in "${existing.name}"`;
    }

    const snapshot = structuredClone(categories);
    const gifs = gif ? [makeStoredGif(gif)] : [];
    const cat: StoredCategory = {
        name,
        src: "",
        format: Format.IMAGE,
        gifs,
        createdAt: Date.now(),
        lastUpdated: Date.now()
    };
    updateThumb(cat);
    categories.push(cat);
    if (!await save(snapshot)) return SAVE_ERROR;
    toast(gif ? `Created "${name}" and added the GIF` : `Created "${name}"`, true);
    return null;
}

export async function addGifToCategory(name: string, gif: GifInput) {
    const cat = findCategory(name);
    if (!cat) return logger.warn("addGifToCategory: category not found", name);

    if (cat.gifs.some(g => g.url === gif.url)) {
        toast("This GIF is already in that category");
        return;
    }

    if (settings.store.exclusiveMode) {
        const existing = categoriesContaining(gif.url)[0];
        if (existing) {
            toast(`Exclusive mode: already in "${existing.name}" - remove it there first`);
            return;
        }
    }

    const snapshot = structuredClone(categories);
    cat.gifs.push(makeStoredGif(gif));
    updateThumb(cat);
    if (!await save(snapshot)) return;
    toast(`Added to "${name}"`, true);
}

export async function removeGifFromCategory(name: string, url: string) {
    const cat = findCategory(name);
    if (!cat) return;

    const snapshot = structuredClone(categories);
    cat.gifs = cat.gifs.filter(g => g.url !== url);
    updateThumb(cat);
    if (!await save(snapshot)) return;
    toast(`Removed from "${name}"`, true);
}

/** @returns error message or null on success */
export async function renameCategory(oldName: string, newName: string): Promise<string | null> {
    newName = newName.trim();
    if (newName === oldName) return null;
    const err = validateName(newName);
    if (err) return err;

    const cat = findCategory(oldName);
    if (!cat) return "Category not found";

    const snapshot = structuredClone(categories);
    const wasViewing = uiRefs.lastCategoryQuery === prefix() + oldName;
    cat.name = newName;
    cat.lastUpdated = Date.now();
    if (!await save(snapshot)) return SAVE_ERROR;
    if (wasViewing) uiRefs.lastCategoryQuery = prefix() + newName;
    return null;
}

export async function setBookmark(name: string, icon: string, color?: string) {
    const cat = findCategory(name);
    if (!cat) return;
    const snapshot = structuredClone(categories);
    cat.bookmark = color ? { icon, color } : { icon };
    cat.lastUpdated = Date.now();
    if (!await save(snapshot)) return;
    toast(`Bookmarked "${name}"`, true);
}

export async function removeBookmark(name: string) {
    const cat = findCategory(name);
    if (!cat?.bookmark) return;
    const snapshot = structuredClone(categories);
    delete cat.bookmark;
    if (!await save(snapshot)) return;
    toast(`Removed bookmark for "${name}"`, true);
}

export async function deleteCategory(name: string) {
    const snapshot = categories;
    categories = categories.filter(c => c.name !== name);
    try {
        await DataStore.set(DATA_KEY, categories);
    } catch (err) {
        logger.error("Failed to delete category", err);
        categories = snapshot;
        toast(SAVE_ERROR);
        refreshUI();
        return;
    }
    refreshUI(name);
    toast(`Deleted "${name}"`, true);
}
