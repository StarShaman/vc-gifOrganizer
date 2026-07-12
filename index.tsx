/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import definePlugin from "@utils/types";
import { ContextMenuApi, React } from "@webpack/common";

import { messageContextMenuPatch, startChatButtons, stopChatButtons } from "./chat";
import { CategoryMenu, GifMenu } from "./components";
import { prefix, settings } from "./settings";
import {
    findCategory, getFormat, GifInput, initStore, logger,
    sortedCategories, uiRefs
} from "./store";
import {
    CategoriesPageInstance, Format, PickerCategory,
    ResultsPageInstance, TileInstance, TileItem
} from "./types";

// Patch finds/matches modeled after Equicord's GifCollections (GPL-3.0-or-later),
// which tracks current Discord builds. Implementation is original.

let oldTrendingCategories: PickerCategory[] | null = null;

function gifFromItem(item: TileItem): GifInput | null {
    if (!item.src || !item.url) return null;
    return {
        src: item.src,
        url: item.url,
        width: item.width,
        height: item.height,
        format: typeof item.format === "number" ? item.format : undefined
    };
}

export default definePlugin({
    name: "GifOrganizer",
    description: "Sort your favorite GIFs into categories, shown as cards at the top of the GIF picker. Add GIFs via the folder button on each tile (or right-click). Less scrolling, more reacting.",
    authors: [{ name: "starshaman", id: 402508513726955520n }],
    tags: ["Media", "Customisation", "Organisation"],
    settings,

    patches: [
        // Front page of the GIF picker: inject our category cards + hide the internal prefix on card labels
        {
            find: "renderCategoryExtras",
            replacement: [
                {
                    match: /(render\(\)\{)(.{1,50}getItemGrid)/,
                    replace: "$1$self.insertCategories(this);$2"
                },
                {
                    match: /("span",\{className:\i\.\i,children:)(\i)/,
                    replace: "$1$self.hidePrefix($2),"
                }
            ]
        },
        // Results view: when the query is one of our categories, serve its gifs
        {
            find: "renderHeaderContent()",
            replacement: {
                match: /(renderContent\(\)\{)(.{1,50}resultItems)/,
                replace: "$1$self.renderContent(this);$2"
            }
        },
        // Don't send our category queries to Tenor
        {
            find: 'type:"GIF_PICKER_QUERY"',
            replacement: {
                match: /(function \i\(.{1,10}\)\{)(.{1,100}\.GIFS_SEARCH,query:)/,
                replace: "$1if($self.shouldStopFetch(arguments[0]))return;$2"
            }
        },
        // Every gif/category tile: add a context menu (the folder button rides on the
        // native favorite star via the DOM observer in chat.tsx)
        {
            find: "renderEmptyFavorite",
            replacement: {
                match: /onClick:this\.handleClick,/,
                replace: "$&onContextMenu:e=>$self.onTileContext(e,this),"
            }
        }
    ],

    contextMenus: {
        "message": messageContextMenuPatch
    },

    async start() {
        await initStore();
        startChatButtons();
    },

    stop() {
        stopChatButtons();
        uiRefs.categoriesPage = null;
        uiRefs.lastCategoryQuery = null;
        oldTrendingCategories = null;
    },

    /** Build picker-shaped cards from our stored categories */
    buildCards(): PickerCategory[] {
        return sortedCategories().map(c => ({
            type: "Category" as const,
            name: prefix() + c.name,
            src: c.src || settings.store.emptyCategoryImage,
            format: c.format ?? Format.IMAGE,
            gifs: c.gifs
        }));
    },

    insertCategories(instance: CategoriesPageInstance) {
        try {
            uiRefs.categoriesPage = instance;
            const current = instance.props.trendingCategories;

            if (current?.length && current[0].type === "Trending")
                oldTrendingCategories = current;

            const cards = this.buildCards();
            instance.props.trendingCategories = settings.store.onlyShowCategories && cards.length
                ? cards
                : [...cards, ...(oldTrendingCategories ?? current ?? [])];
        } catch (err) {
            logger.error("insertCategories failed", err);
        }
    },

    hidePrefix(name: unknown) {
        return typeof name === "string" && name.startsWith(prefix())
            ? name.slice(prefix().length)
            : name;
    },

    renderContent(instance: ResultsPageInstance) {
        try {
            const { query } = instance.props;
            if (!query?.startsWith(prefix())) {
                uiRefs.lastCategoryQuery = null;
                return;
            }

            const cat = findCategory(query.slice(prefix().length));
            if (!cat) return;

            uiRefs.lastCategoryQuery = query;

            const gifs = settings.store.newestFirst ? [...cat.gifs].reverse() : cat.gifs;
            instance.props.resultItems = gifs.map(g => ({
                id: g.id,
                format: g.format ?? getFormat(g.src),
                src: g.src,
                url: g.url,
                width: g.width,
                height: g.height
            }));
        } catch (err) {
            logger.error("renderContent failed", err);
        }
    },

    shouldStopFetch(query: string) {
        return typeof query === "string"
            && query.startsWith(prefix())
            && findCategory(query.slice(prefix().length)) != null;
    },

    onTileContext(e: React.MouseEvent, instance: TileInstance) {
        try {
            const item = instance?.props?.item;
            if (!item) return;

            // one of our category cards -> manage menu
            if (item.name?.startsWith(prefix())) {
                const name = item.name.slice(prefix().length);
                ContextMenuApi.openContextMenu(e, () => <CategoryMenu name={name} />);
                return;
            }

            // plain gif tile -> organize menu
            const gif = gifFromItem(item);
            if (gif && item.type == null && item.name == null)
                ContextMenuApi.openContextMenu(e, () => <GifMenu gif={gif} instance={instance} />);
        } catch (err) {
            logger.error("onTileContext failed", err);
        }
    }
});
