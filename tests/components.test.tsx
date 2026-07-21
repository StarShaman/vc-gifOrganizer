import { DataStore } from "@api/index";
import { __resetWebpackMocks } from "@webpack/common";
import { beforeEach, describe, expect, it } from "vitest";

import { CategoryMenu, gifMenuItems, GifMenu } from "../components";
import { settings } from "../settings";
import { createCategory, findCategory, GifInput, initStore, setBookmark } from "../store";

function ids(elements: any[]): (string | undefined)[] {
    return elements.map(el => el?.props?.id ?? el?.type?.displayName);
}

const gif: GifInput = { src: "https://x.com/a.gif", url: "https://x.com/a.gif" };

beforeEach(async () => {
    (DataStore as any).__reset();
    __resetWebpackMocks();
    await initStore();
    settings.store.categoryPrefix = "vgo:";
    settings.store.cardSort = "name";
    settings.store.exclusiveMode = false;
    settings.store.emptyCategoryImage = "https://empty.example.com/e.gif";
});

describe("gifMenuItems", () => {
    it("offers only 'new category' when there are no categories", () => {
        expect(ids(gifMenuItems(gif))).toEqual(["vc-gifo-new-category"]);
    });

    it("offers an add entry per category plus 'new category'", async () => {
        await createCategory("Alpha");
        await createCategory("Beta");
        expect(ids(gifMenuItems(gif))).toEqual([
            "vc-gifo-add-Alpha",
            "vc-gifo-add-Beta",
            "vc-gifo-new-category"
        ]);
    });

    it("separates add options from remove options for a filed gif", async () => {
        await createCategory("Alpha", gif);
        await createCategory("Beta");
        expect(ids(gifMenuItems(gif))).toEqual([
            "vc-gifo-add-Beta",
            "vc-gifo-new-category",
            "MenuSeparator",
            "vc-gifo-remove-Alpha"
        ]);
    });

    it("only offers removal in exclusive mode once the gif is filed", async () => {
        settings.store.exclusiveMode = true;
        await createCategory("Alpha", gif);
        await createCategory("Beta");
        expect(ids(gifMenuItems(gif))).toEqual([
            "MenuSeparator",
            "vc-gifo-remove-Alpha"
        ]);
    });
});

describe("menu components smoke tests", () => {
    it("GifMenu wraps the gif menu items", () => {
        const el: any = GifMenu({ gif });
        expect(el.type.displayName).toBe("Menu");
    });

    it("CategoryMenu offers unbookmark only when the category is bookmarked", async () => {
        await createCategory("Alpha");
        const plain: any = CategoryMenu({ name: "Alpha" });
        const plainIds = ids(plain.props.children.filter(Boolean));
        expect(plainIds).not.toContain("vc-gifo-unbookmark");

        await setBookmark("Alpha", "builtin:star");
        expect(findCategory("Alpha")!.bookmark).toBeDefined();
        const marked: any = CategoryMenu({ name: "Alpha" });
        const markedIds = ids(marked.props.children.filter(Boolean));
        expect(markedIds).toContain("vc-gifo-unbookmark");
    });
});
