/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";
import { FluxDispatcher, Toasts } from "@webpack/common";

import { prefix, settings } from "./settings";
import { CategoriesPageInstance, Format, StoredCategory, StoredGif } from "./types";

export const logger = new Logger("GifOrganizer");

const DATA_KEY = "GifOrganizer_categories";
export const ITEM_PREFIX = "vgo-item:";

export let categories: StoredCategory[] = [];

/** Live references into the picker so we can refresh it after changes */
export const uiRefs = {
    categoriesPage: null as CategoriesPageInstance | null,
    /** full query (with prefix) of the category view currently open, if any */
    lastCategoryQuery: null as string | null
};

const VIDEO_EXTENSIONS = ["mp4", "ogg", "webm", "avi", "wmv", "flv", "mov", "mkv", "m4v"];

export function getFormat(url: string): Format {
    const ext = url?.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
    return ext && VIDEO_EXTENSIONS.includes(ext) ? Format.VIDEO : Format.IMAGE;
}

export async function initStore() {
    categories = (await DataStore.get<StoredCategory[]>(DATA_KEY)) ?? [];
}

async function save() {
    await DataStore.set(DATA_KEY, categories);
    refreshUI();
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

    const q = uiRefs.lastCategoryQuery;
    if (!q) return;

    if (deletedName != null && q === prefix() + deletedName) {
        uiRefs.lastCategoryQuery = null;
        FluxDispatcher.dispatch({ type: "GIF_PICKER_QUERY", query: "" });
        return;
    }

    // re-dispatch the open category query so its grid refreshes
    FluxDispatcher.dispatch({ type: "GIF_PICKER_QUERY", query: "" });
    FluxDispatcher.dispatch({ type: "GIF_PICKER_QUERY", query: q });
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
    await save();
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

    cat.gifs.push(makeStoredGif(gif));
    updateThumb(cat);
    await save();
    toast(`Added to "${name}"`, true);
}

export async function removeGifFromCategory(name: string, url: string) {
    const cat = findCategory(name);
    if (!cat) return;

    cat.gifs = cat.gifs.filter(g => g.url !== url);
    updateThumb(cat);
    await save();
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

    const wasViewing = uiRefs.lastCategoryQuery === prefix() + oldName;
    cat.name = newName;
    cat.lastUpdated = Date.now();
    if (wasViewing) uiRefs.lastCategoryQuery = prefix() + newName;
    await save();
    return null;
}

export async function deleteCategory(name: string) {
    categories = categories.filter(c => c.name !== name);
    await DataStore.set(DATA_KEY, categories);
    refreshUI(name);
    toast(`Deleted "${name}"`, true);
}
