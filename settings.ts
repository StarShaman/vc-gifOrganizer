/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    categoryPrefix: {
        description: "Internal prefix that marks a picker query as a category (hidden in the UI). Must not be empty.",
        type: OptionType.STRING,
        default: "vgo:"
    },
    onlyShowCategories: {
        description: "Hide Discord's trending categories on the GIF picker front page, leaving only your own.",
        type: OptionType.BOOLEAN,
        default: false
    },
    newestFirst: {
        description: "Show the most recently added GIFs first when viewing a category.",
        type: OptionType.BOOLEAN,
        default: true
    },
    cardSort: {
        description: "How your category cards are ordered.",
        type: OptionType.SELECT,
        options: [
            { label: "Name (A → Z)", value: "name", default: true },
            { label: "Recently updated first", value: "updated" },
            { label: "Newest created first", value: "created" }
        ]
    },
    hideStarInCategories: {
        description: "Hide Discord's add/remove-favorites star on tiles while browsing one of your categories.",
        type: OptionType.BOOLEAN,
        default: false
    },
    exclusiveMode: {
        description: "Each GIF/video can only be in one category at a time. Remove it from its category before filing it elsewhere.",
        type: OptionType.BOOLEAN,
        default: false
    },
    videoSupport: {
        description: "Also allow saving plain videos (uploads and video embeds, not just GIFs) to categories, with a folder button on videos in chat.",
        type: OptionType.BOOLEAN,
        default: false
    },
    chatButton: {
        description: "Show a category button next to the favorite star on GIFs in chat.",
        type: OptionType.BOOLEAN,
        default: true
    },
    chatContextMenu: {
        description: "Add a 'GIF categories' entry to the right-click menu of GIFs in chat.",
        type: OptionType.BOOLEAN,
        default: true
    },
    emptyCategoryImage: {
        description: "Thumbnail shown for a category that has no GIFs yet.",
        type: OptionType.STRING,
        default: "https://c.tenor.com/YEG33HsLEaIAAAAC/parksandrec-oops.gif"
    }
});

/** Prefix, guaranteed non-empty even if the user blanks the setting */
export function prefix(): string {
    return settings.store.categoryPrefix || "vgo:";
}
