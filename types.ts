/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export enum Format {
    IMAGE = 1,
    VIDEO = 2
}

/** A GIF stored inside one of our categories */
export interface StoredGif {
    id: string;
    src: string;
    url: string;
    width: number;
    height: number;
    format: Format;
    /** "video" = a real video (upload/embed); "gif" (or absent) = gif, incl. Tenor mp4s */
    kind?: "gif" | "video";
    addedAt: number;
}

/** A user-created category, persisted via DataStore (name is stored WITHOUT prefix) */
export interface StoredCategory {
    name: string;
    /** thumbnail source, updated to the latest added gif */
    src: string;
    format: Format;
    gifs: StoredGif[];
    /** present when the category is pinned to the picker sidebar; icon is "builtin:<name>" or an image URL/data-URL */
    bookmark?: { icon: string; };
    createdAt: number;
    lastUpdated: number;
}

/** Shape Discord expects for a category card in the picker */
export interface PickerCategory {
    type: "Trending" | "Category";
    name: string;
    src: string;
    format: Format;
    gifs?: unknown[];
}

/** The gif/category item a picker tile renders */
export interface TileItem {
    type?: string;
    name?: string;
    id?: string;
    src?: string;
    url?: string;
    width?: number;
    height?: number;
    format?: Format;
}

export interface TileInstance {
    props: { item?: TileItem; };
    forceUpdate(): void;
}

export interface CategoriesPageInstance {
    props: { trendingCategories: PickerCategory[]; };
    forceUpdate(): void;
}

export interface ResultsPageInstance {
    props: {
        query?: string;
        resultItems?: {
            id: string;
            format: Format;
            src: string;
            url: string;
            width: number;
            height: number;
        }[];
    };
    forceUpdate(): void;
}
