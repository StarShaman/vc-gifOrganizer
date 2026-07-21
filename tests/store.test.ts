import { DataStore } from "@api/index";
import { dispatchedEvents, shownToasts, __resetWebpackMocks } from "@webpack/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { settings } from "../settings";
import {
    addGifToCategory, categories, categoriesContaining, createCategory,
    deleteCategory, findCategory, getFormat, GifInput, inferKind, initStore,
    ITEM_PREFIX, refreshUI, removeBookmark, removeGifFromCategory, renameCategory,
    setBookmark, sortedCategories, uiRefs
} from "../store";
import { Format, StoredGif } from "../types";

const DATA_KEY = "GifOrganizer_categories";

function gif(overrides: Partial<GifInput> = {}): GifInput {
    return { src: "https://cdn.example.com/a.gif", url: "https://cdn.example.com/a.gif", ...overrides };
}

async function seed(name: string, g?: GifInput) {
    const err = await createCategory(name, g);
    expect(err).toBeNull();
    return findCategory(name)!;
}

beforeEach(async () => {
    (DataStore as any).__reset();
    __resetWebpackMocks();
    await initStore();

    settings.store.categoryPrefix = "vgo:";
    settings.store.cardSort = "name";
    settings.store.exclusiveMode = false;
    settings.store.emptyCategoryImage = "https://empty.example.com/e.gif";

    uiRefs.categoriesPage = null;
    uiRefs.pickerRoot = null;
    uiRefs.lastCategoryQuery = null;
    uiRefs.refreshSidebar = null;
});

describe("getFormat", () => {
    it.each([
        ["https://x.com/a.mp4", Format.VIDEO],
        ["https://x.com/a.WEBM", Format.VIDEO],
        ["https://x.com/a.mov?token=1", Format.VIDEO],
        ["https://x.com/a.gif", Format.IMAGE],
        ["https://x.com/a.png#frag", Format.IMAGE],
        ["https://x.com/no-extension", Format.IMAGE]
    ])("classifies %s", (url, expected) => {
        expect(getFormat(url)).toBe(expected);
    });

    it("defaults to IMAGE for empty input", () => {
        expect(getFormat("")).toBe(Format.IMAGE);
        expect(getFormat(undefined as unknown as string)).toBe(Format.IMAGE);
    });
});

describe("inferKind", () => {
    const base: StoredGif = {
        id: "x", src: "", url: "", width: 0, height: 0, format: Format.VIDEO, addedAt: 0
    };

    it("returns gif for non-video formats", () => {
        expect(inferKind({ ...base, format: Format.IMAGE, src: "https://x.com/a.mp4" })).toBe("gif");
    });

    it("treats Tenor/Giphy mp4s as gifs via src", () => {
        expect(inferKind({ ...base, src: "https://media.tenor.com/abc.mp4", url: "u" })).toBe("gif");
        expect(inferKind({ ...base, src: "https://media1.giphy.com/x.mp4", url: "u" })).toBe("gif");
    });

    it("treats proxied Tenor urls as gifs via url", () => {
        expect(inferKind({
            ...base,
            src: "https://images-ext-1.discordapp.net/external/x/media.tenor.com/y.mp4",
            url: "https://tenor.com/view/abc"
        })).toBe("gif");
    });

    it("returns video for genuine video hosts", () => {
        expect(inferKind({ ...base, src: "https://cdn.discordapp.com/x.mp4", url: "https://cdn.discordapp.com/x.mp4" })).toBe("video");
    });

    it("honours an explicit kind when host is not gif-like", () => {
        expect(inferKind({ ...base, src: "https://cdn.discordapp.com/x.mp4", url: "u", kind: "gif" })).toBe("gif");
    });

    it("falls back to getFormat when format is absent", () => {
        const g = { ...base, format: undefined as unknown as Format, src: "https://x.com/a.gif", url: "u" };
        expect(inferKind(g)).toBe("gif");
    });
});

describe("createCategory", () => {
    it("rejects an empty name", async () => {
        expect(await createCategory("   ")).toBe("Category name can't be empty");
        expect(categories).toHaveLength(0);
    });

    it("rejects a duplicate name case-insensitively", async () => {
        await seed("Reactions");
        expect(await createCategory("reactions")).toBe("A category with that name already exists");
        expect(categories).toHaveLength(1);
    });

    it("creates an empty category using the empty-category thumbnail", async () => {
        const err = await createCategory("Empty");
        expect(err).toBeNull();
        const cat = findCategory("Empty")!;
        expect(cat.gifs).toHaveLength(0);
        expect(cat.src).toBe("https://empty.example.com/e.gif");
        expect(await DataStore.get(DATA_KEY)).toHaveLength(1);
        expect(shownToasts.at(-1)).toMatchObject({ type: 1 });
    });

    it("creates a category seeded with a gif and uses it as the thumbnail", async () => {
        await createCategory("Cats", gif({ src: "https://cdn.example.com/cat.gif" }));
        const cat = findCategory("Cats")!;
        expect(cat.gifs).toHaveLength(1);
        expect(cat.gifs[0].id.startsWith(ITEM_PREFIX)).toBe(true);
        expect(cat.src).toBe("https://cdn.example.com/cat.gif");
    });

    it("blocks creation in exclusive mode when the gif is filed elsewhere", async () => {
        settings.store.exclusiveMode = true;
        await seed("A", gif({ url: "https://x.com/shared.gif" }));
        const err = await createCategory("B", gif({ url: "https://x.com/shared.gif" }));
        expect(err).toBe('Exclusive mode: this item is already in "A"');
        expect(findCategory("B")).toBeUndefined();
    });
});

describe("addGifToCategory", () => {
    it("warns and no-ops when the category is missing", async () => {
        await addGifToCategory("nope", gif());
        expect(shownToasts).toHaveLength(0);
    });

    it("adds a gif and updates the thumbnail", async () => {
        await seed("A");
        await addGifToCategory("A", gif({ src: "https://cdn.example.com/new.gif" }));
        const cat = findCategory("A")!;
        expect(cat.gifs).toHaveLength(1);
        expect(cat.src).toBe("https://cdn.example.com/new.gif");
    });

    it("refuses to add a duplicate url", async () => {
        await seed("A", gif({ url: "https://x.com/dup.gif" }));
        await addGifToCategory("A", gif({ url: "https://x.com/dup.gif" }));
        expect(findCategory("A")!.gifs).toHaveLength(1);
        expect(shownToasts.at(-1)).toMatchObject({ type: 2 });
    });

    it("blocks adding in exclusive mode when filed elsewhere", async () => {
        settings.store.exclusiveMode = true;
        await seed("A", gif({ url: "https://x.com/shared.gif" }));
        await seed("B");
        await addGifToCategory("B", gif({ url: "https://x.com/shared.gif" }));
        expect(findCategory("B")!.gifs).toHaveLength(0);
    });

    it("inherits kind when re-saving a url already known as a video", async () => {
        await seed("A", gif({ url: "https://x.com/v.mp4", src: "https://x.com/v.mp4", kind: "video" }));
        await seed("B");
        await addGifToCategory("B", { url: "https://x.com/v.mp4", src: "https://x.com/v.mp4" });
        expect(findCategory("B")!.gifs[0].kind).toBe("video");
    });
});

describe("removeGifFromCategory", () => {
    it("no-ops for a missing category", async () => {
        await removeGifFromCategory("nope", "u");
        expect(shownToasts).toHaveLength(0);
    });

    it("removes the gif and refreshes the thumbnail to the empty image", async () => {
        await seed("A", gif({ url: "https://x.com/only.gif" }));
        await removeGifFromCategory("A", "https://x.com/only.gif");
        const cat = findCategory("A")!;
        expect(cat.gifs).toHaveLength(0);
        expect(cat.src).toBe("https://empty.example.com/e.gif");
    });
});

describe("renameCategory", () => {
    it("is a no-op when the name is unchanged", async () => {
        await seed("A");
        expect(await renameCategory("A", "A")).toBeNull();
    });

    it("rejects renaming onto an existing name", async () => {
        await seed("A");
        await seed("B");
        expect(await renameCategory("A", "B")).toBe("A category with that name already exists");
    });

    it("returns an error when the source is missing", async () => {
        expect(await renameCategory("ghost", "new")).toBe("Category not found");
    });

    it("renames and retargets the open category query when viewing it", async () => {
        await seed("Old");
        uiRefs.lastCategoryQuery = "vgo:Old";
        expect(await renameCategory("Old", "New")).toBeNull();
        expect(findCategory("New")).toBeDefined();
        expect(findCategory("Old")).toBeUndefined();
        expect(uiRefs.lastCategoryQuery).toBe("vgo:New");
    });

    it("leaves lastCategoryQuery untouched when a different category is open", async () => {
        await seed("Old");
        uiRefs.lastCategoryQuery = "vgo:Other";
        await renameCategory("Old", "New");
        expect(uiRefs.lastCategoryQuery).toBe("vgo:Other");
    });
});

describe("bookmarks", () => {
    it("sets a bookmark with a color", async () => {
        await seed("A");
        await setBookmark("A", "builtin:star", "#ff0000");
        expect(findCategory("A")!.bookmark).toEqual({ icon: "builtin:star", color: "#ff0000" });
    });

    it("sets a bookmark without a color", async () => {
        await seed("A");
        await setBookmark("A", "builtin:heart");
        expect(findCategory("A")!.bookmark).toEqual({ icon: "builtin:heart" });
    });

    it("no-ops setBookmark for a missing category", async () => {
        await setBookmark("nope", "builtin:star");
        expect(shownToasts).toHaveLength(0);
    });

    it("removes an existing bookmark", async () => {
        await seed("A");
        await setBookmark("A", "builtin:star");
        await removeBookmark("A");
        expect(findCategory("A")!.bookmark).toBeUndefined();
    });

    it("no-ops removeBookmark when there is no bookmark", async () => {
        await seed("A");
        __resetWebpackMocks();
        await removeBookmark("A");
        expect(shownToasts).toHaveLength(0);
    });
});

describe("deleteCategory", () => {
    it("removes the category and persists the change", async () => {
        await seed("A");
        await seed("B");
        await deleteCategory("A");
        expect(findCategory("A")).toBeUndefined();
        expect(await DataStore.get(DATA_KEY)).toHaveLength(1);
    });
});

describe("queries", () => {
    it("findCategory looks up by exact name", async () => {
        await seed("A");
        expect(findCategory("A")).toBeDefined();
        expect(findCategory("a")).toBeUndefined();
    });

    it("categoriesContaining returns every category holding the url", async () => {
        await seed("A", gif({ url: "https://x.com/shared.gif" }));
        await seed("B", gif({ url: "https://x.com/shared.gif" }));
        await seed("C", gif({ url: "https://x.com/other.gif" }));
        const names = categoriesContaining("https://x.com/shared.gif").map(c => c.name).sort();
        expect(names).toEqual(["A", "B"]);
    });
});

describe("sortedCategories", () => {
    async function threeCategories() {
        await createCategory("Beta");
        await createCategory("alpha");
        await createCategory("Gamma");
        // give them distinct timestamps
        findCategory("Beta")!.createdAt = 100;
        findCategory("Beta")!.lastUpdated = 300;
        findCategory("alpha")!.createdAt = 200;
        findCategory("alpha")!.lastUpdated = 100;
        findCategory("Gamma")!.createdAt = 300;
        findCategory("Gamma")!.lastUpdated = 200;
    }

    it("sorts by name (locale-aware, case-insensitive ordering) by default", async () => {
        await threeCategories();
        expect(sortedCategories().map(c => c.name)).toEqual(["alpha", "Beta", "Gamma"]);
    });

    it("sorts by most recently updated", async () => {
        await threeCategories();
        settings.store.cardSort = "updated";
        expect(sortedCategories().map(c => c.name)).toEqual(["Beta", "Gamma", "alpha"]);
    });

    it("sorts by newest created", async () => {
        await threeCategories();
        settings.store.cardSort = "created";
        expect(sortedCategories().map(c => c.name)).toEqual(["Gamma", "alpha", "Beta"]);
    });

    it("does not mutate the underlying categories array order", async () => {
        await threeCategories();
        const before = categories.map(c => c.name);
        sortedCategories();
        expect(categories.map(c => c.name)).toEqual(before);
    });
});

describe("refreshUI", () => {
    it("calls forceUpdate and refreshSidebar hooks", async () => {
        const forceUpdate = vi.fn();
        const refreshSidebar = vi.fn();
        uiRefs.categoriesPage = { props: { trendingCategories: [] }, forceUpdate };
        uiRefs.refreshSidebar = refreshSidebar;
        refreshUI();
        expect(forceUpdate).toHaveBeenCalled();
        expect(refreshSidebar).toHaveBeenCalled();
    });

    it("does nothing further when no category view is open", () => {
        uiRefs.lastCategoryQuery = null;
        refreshUI();
        expect(dispatchedEvents).toHaveLength(0);
    });

    it("clears the query and resets the picker when the open category was deleted", () => {
        uiRefs.lastCategoryQuery = "vgo:A";
        refreshUI("A");
        expect(uiRefs.lastCategoryQuery).toBeNull();
        expect(dispatchedEvents).toEqual([{ type: "GIF_PICKER_QUERY", query: "" }]);
    });

    it("re-dispatches the open query to refresh its grid", () => {
        uiRefs.lastCategoryQuery = "vgo:A";
        refreshUI("B");
        expect(dispatchedEvents).toEqual([
            { type: "GIF_PICKER_QUERY", query: "" },
            { type: "GIF_PICKER_QUERY", query: "vgo:A" }
        ]);
    });
});

describe("makeStoredGif (via createCategory)", () => {
    it("fills defaults and infers format from the src", async () => {
        await createCategory("A", { src: "https://x.com/a.mp4", url: "https://x.com/a.mp4" });
        const g = findCategory("A")!.gifs[0];
        expect(g.width).toBe(0);
        expect(g.height).toBe(0);
        expect(g.format).toBe(Format.VIDEO);
        expect(g.kind).toBe("gif");
        expect(typeof g.addedAt).toBe("number");
    });
});
