import { DataStore } from "@api/index";
import { __resetWebpackMocks } from "@webpack/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// index.tsx wires up DOM observers / React menus through ./chat and ./components;
// those are exercised elsewhere and irrelevant to the pure picker logic tested here.
vi.mock("../chat", () => ({
    messageContextMenuPatch: () => { },
    startChatButtons: () => { },
    stopChatButtons: () => { }
}));
vi.mock("../components", () => ({
    CategoryMenu: () => null,
    GifMenu: () => null
}));

import plugin from "../index";
import { settings } from "../settings";
import { createCategory, findCategory, initStore, uiRefs } from "../store";
import { Format, PickerCategory, ResultsPageInstance } from "../types";

const trending: PickerCategory[] = [
    { type: "Trending", name: "Excited", src: "https://t.example.com/x.gif", format: Format.IMAGE }
];

beforeEach(async () => {
    (DataStore as any).__reset();
    __resetWebpackMocks();
    await initStore();

    settings.store.categoryPrefix = "vgo:";
    settings.store.cardSort = "name";
    settings.store.onlyShowCategories = false;
    settings.store.newestFirst = true;
    settings.store.emptyCategoryImage = "https://empty.example.com/e.gif";

    uiRefs.categoriesPage = null;
    uiRefs.pickerRoot = null;
    uiRefs.lastCategoryQuery = null;
});

describe("buildCards", () => {
    it("maps stored categories into prefixed picker cards", async () => {
        await createCategory("Cats", { src: "https://x.com/c.gif", url: "https://x.com/c.gif" });
        const [card] = plugin.buildCards();
        expect(card).toMatchObject({ type: "Category", name: "vgo:Cats", src: "https://x.com/c.gif" });
    });

    it("uses the empty-category image for categories without a thumbnail", async () => {
        await createCategory("Empty");
        const [card] = plugin.buildCards();
        expect(card.src).toBe("https://empty.example.com/e.gif");
    });
});

describe("hidePrefix", () => {
    it("strips the prefix from category labels", () => {
        expect(plugin.hidePrefix("vgo:Reactions")).toBe("Reactions");
    });

    it("passes through non-prefixed values unchanged", () => {
        expect(plugin.hidePrefix("Trending")).toBe("Trending");
        expect(plugin.hidePrefix(42)).toBe(42);
    });
});

describe("shouldStopFetch", () => {
    it("is true for a query naming an existing category", async () => {
        await createCategory("Cats");
        expect(plugin.shouldStopFetch("vgo:Cats")).toBe(true);
    });

    it("is false for a prefixed query with no matching category", () => {
        expect(plugin.shouldStopFetch("vgo:Nope")).toBe(false);
    });

    it("is false for a plain (non-prefixed) query", async () => {
        await createCategory("Cats");
        expect(plugin.shouldStopFetch("cats")).toBe(false);
    });
});

describe("insertCategories", () => {
    it("prepends our cards before Discord's trending categories", async () => {
        await createCategory("Cats");
        const instance = { props: { trendingCategories: [...trending] }, forceUpdate: () => { } };
        plugin.insertCategories(instance);
        expect(instance.props.trendingCategories.map(c => c.name)).toEqual(["vgo:Cats", "Excited"]);
        expect(uiRefs.categoriesPage).toBe(instance);
    });

    it("shows only our cards when onlyShowCategories is enabled", async () => {
        settings.store.onlyShowCategories = true;
        await createCategory("Cats");
        const instance = { props: { trendingCategories: [...trending] }, forceUpdate: () => { } };
        plugin.insertCategories(instance);
        expect(instance.props.trendingCategories.map(c => c.name)).toEqual(["vgo:Cats"]);
    });

    it("keeps Discord's trending list when we have no categories", () => {
        const instance = { props: { trendingCategories: [...trending] }, forceUpdate: () => { } };
        plugin.insertCategories(instance);
        expect(instance.props.trendingCategories.map(c => c.name)).toEqual(["Excited"]);
    });
});

describe("renderContent", () => {
    function makeInstance(query?: string): ResultsPageInstance {
        return { props: { query, resultItems: [] }, forceUpdate: () => { } };
    }

    it("clears the tracked query and returns for non-category queries", () => {
        uiRefs.lastCategoryQuery = "vgo:Old";
        const instance = makeInstance("cats");
        plugin.renderContent(instance);
        expect(uiRefs.lastCategoryQuery).toBeNull();
        expect(uiRefs.pickerRoot).toBe(instance);
    });

    it("serves a category's gifs newest-first by default", async () => {
        await createCategory("Cats", { src: "https://x.com/first.gif", url: "https://x.com/first.gif" });
        findCategory("Cats")!.gifs.push({
            id: "id2", src: "https://x.com/second.gif", url: "https://x.com/second.gif",
            width: 1, height: 2, format: Format.IMAGE, addedAt: 2
        });

        const instance = makeInstance("vgo:Cats");
        plugin.renderContent(instance);

        expect(uiRefs.lastCategoryQuery).toBe("vgo:Cats");
        expect(instance.props.resultItems!.map(i => i.url)).toEqual([
            "https://x.com/second.gif",
            "https://x.com/first.gif"
        ]);
    });

    it("keeps insertion order when newestFirst is disabled", async () => {
        settings.store.newestFirst = false;
        await createCategory("Cats", { src: "https://x.com/first.gif", url: "https://x.com/first.gif" });
        findCategory("Cats")!.gifs.push({
            id: "id2", src: "https://x.com/second.gif", url: "https://x.com/second.gif",
            width: 1, height: 2, format: Format.IMAGE, addedAt: 2
        });

        const instance = makeInstance("vgo:Cats");
        plugin.renderContent(instance);
        expect(instance.props.resultItems!.map(i => i.url)).toEqual([
            "https://x.com/first.gif",
            "https://x.com/second.gif"
        ]);
    });

    it("leaves resultItems untouched for an unknown category", () => {
        const instance = makeInstance("vgo:Ghost");
        instance.props.resultItems = [];
        plugin.renderContent(instance);
        expect(instance.props.resultItems).toEqual([]);
    });
});
