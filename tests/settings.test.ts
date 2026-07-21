import { beforeEach, describe, expect, it } from "vitest";

import { prefix, settings } from "../settings";

describe("settings", () => {
    beforeEach(() => {
        settings.store.categoryPrefix = "vgo:";
    });

    it("seeds declared defaults into the store", () => {
        expect(settings.store.categoryPrefix).toBe("vgo:");
        expect(settings.store.onlyShowCategories).toBe(false);
        expect(settings.store.newestFirst).toBe(true);
        expect(settings.store.chatButton).toBe(true);
        expect(settings.store.emptyCategoryImage).toContain("tenor.com");
    });

    it("resolves the default option of a SELECT setting", () => {
        expect(settings.store.cardSort).toBe("name");
    });

    describe("prefix()", () => {
        it("returns the configured prefix", () => {
            settings.store.categoryPrefix = "cat:";
            expect(prefix()).toBe("cat:");
        });

        it("falls back to 'vgo:' when the prefix is blanked", () => {
            settings.store.categoryPrefix = "";
            expect(prefix()).toBe("vgo:");
        });
    });
});
