import { DataStore } from "@api/index";
import { __resetWebpackMocks } from "@webpack/common";
import { beforeEach, describe, expect, it } from "vitest";

import { messageContextMenuPatch, startChatButtons, stopChatButtons } from "../chat";
import { settings } from "../settings";
import { initStore, uiRefs } from "../store";

function hasChatItem(children: any[]): boolean {
    return children.some(c => c?.props?.id === "vc-gifo-chat");
}

const imageMessage = {
    embeds: [{ image: { url: "https://x.com/a.gif", proxyURL: "https://p.com/a.gif", width: 1, height: 2 } }],
    attachments: []
};

beforeEach(async () => {
    (DataStore as any).__reset();
    __resetWebpackMocks();
    await initStore();
    settings.store.categoryPrefix = "vgo:";
    settings.store.chatContextMenu = true;
    settings.store.videoSupport = false;
    document.body.innerHTML = "";
});

describe("messageContextMenuPatch", () => {
    it("does nothing when the chat context menu is disabled", () => {
        settings.store.chatContextMenu = false;
        const children: any[] = [];
        messageContextMenuPatch(children, { message: imageMessage, itemSrc: "https://x.com/a.gif" });
        expect(hasChatItem(children)).toBe(false);
    });

    it("does nothing without props or a message", () => {
        const a: any[] = [];
        messageContextMenuPatch(a, undefined);
        expect(a).toHaveLength(0);

        const b: any[] = [];
        messageContextMenuPatch(b, {});
        expect(b).toHaveLength(0);
    });

    it("does nothing for a message with no media", () => {
        const children: any[] = [];
        messageContextMenuPatch(children, {
            message: { embeds: [], attachments: [] },
            itemSrc: "https://x.com/a.gif"
        });
        expect(hasChatItem(children)).toBe(false);
    });

    it("adds a 'GIF categories' item for a matched image embed", () => {
        const children: any[] = [];
        messageContextMenuPatch(children, { message: imageMessage, itemSrc: "https://x.com/a.gif" });
        expect(hasChatItem(children)).toBe(true);
    });

    it("does not add the item twice", () => {
        const children: any[] = [];
        messageContextMenuPatch(children, { message: imageMessage, itemSrc: "https://x.com/a.gif" });
        messageContextMenuPatch(children, { message: imageMessage, itemSrc: "https://x.com/a.gif" });
        expect(children.filter(c => c?.props?.id === "vc-gifo-chat")).toHaveLength(1);
    });

    it("skips a plain-video embed unless video support is on", () => {
        const videoMessage = {
            embeds: [{ url: "https://x.com/v", video: { proxyURL: "https://p.com/v.mp4", url: "https://x.com/v.mp4" }, provider: { name: "YouTube" } }],
            attachments: []
        };
        const off: any[] = [];
        messageContextMenuPatch(off, { message: videoMessage, itemSrc: "https://p.com/v.mp4" });
        expect(hasChatItem(off)).toBe(false);

        settings.store.videoSupport = true;
        const on: any[] = [];
        messageContextMenuPatch(on, { message: videoMessage, itemSrc: "https://p.com/v.mp4" });
        expect(hasChatItem(on)).toBe(true);
    });
});

describe("startChatButtons / stopChatButtons", () => {
    it("installs and tears down the sidebar refresh hook", () => {
        expect(uiRefs.refreshSidebar).toBeNull();
        startChatButtons();
        expect(typeof uiRefs.refreshSidebar).toBe("function");
        stopChatButtons();
        expect(uiRefs.refreshSidebar).toBeNull();
    });

    it("removes injected buttons, badges and sidebars on stop", () => {
        startChatButtons();
        document.body.innerHTML = `
            <div data-vc-gifo="https://x.com/a.gif"></div>
            <div class="vc-gifo-badge"></div>
            <div class="vc-gifo-sidebar"></div>
            <div class="vc-gifo-squeeze"></div>
        `;
        stopChatButtons();
        expect(document.querySelector("[data-vc-gifo]")).toBeNull();
        expect(document.querySelector(".vc-gifo-badge")).toBeNull();
        expect(document.querySelector(".vc-gifo-sidebar")).toBeNull();
        expect(document.querySelector(".vc-gifo-squeeze")).toBeNull();
    });
});
