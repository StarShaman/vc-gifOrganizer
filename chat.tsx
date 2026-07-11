/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Message } from "@vencord/discord-types";
import { ContextMenuApi, Menu } from "@webpack/common";

import { GifMenu, gifMenuItems } from "./components";
import { settings } from "./settings";
import { GifInput, logger } from "./store";
import { Format } from "./types";

const BTN_CLASS = "vc-gifo-overlay-btn";

const FOLDER_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"
    d="M3 6a2 2 0 0 1 2-2h3.59a1 1 0 0 1 .7.3L10.7 5.7a1 1 0 0 0 .71.3H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>
<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 10.5v5M9.5 13h5"/>
</svg>`;

/* ------------------------------- shared helpers ------------------------------- */

function cleanUrl(url: string): string {
    try {
        const u = new URL(url);
        return u.origin + u.pathname;
    } catch {
        return url;
    }
}

function coerceFormat(format: unknown): Format | undefined {
    return format === Format.IMAGE || format === Format.VIDEO ? format : undefined;
}

function openGifMenu(e: MouseEvent, gif: GifInput, target: HTMLElement) {
    ContextMenuApi.openContextMenu({
        pageX: e.pageX,
        pageY: e.pageY,
        clientX: e.clientX,
        clientY: e.clientY,
        preventDefault() { },
        stopPropagation() { },
        target,
        currentTarget: target,
        nativeEvent: e
    } as any, () => <GifMenu gif={gif} />);
}

/**
 * Build the overlay folder button as a plain DOM node.
 * IMPORTANT: only ever APPEND this as the last child of a stable container.
 * Never insert it between React-managed siblings - React's reconciler will
 * crash the client when it tries to reorder nodes around a foreign element.
 */
export function makeOverlayButton(gif: GifInput, variant: "picker" | "chat" = "chat"): HTMLElement {
    const btn = document.createElement("div");
    btn.className = `${BTN_CLASS} ${BTN_CLASS}-${variant}`;
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Add GIF to category");
    btn.innerHTML = FOLDER_SVG;
    btn.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        openGifMenu(e, gif, btn);
    });
    return btn;
}

/* ---------------------------- on-gif overlay button ---------------------------- */

/** Walk the React fiber upwards from the native star to find the gif props it was rendered with */
function findGifProps(node: HTMLElement): GifInput | null {
    try {
        const fiberKey = Object.keys(node).find(k => k.startsWith("__reactFiber$"));
        if (!fiberKey) return null;

        let fiber: any = (node as any)[fiberKey];
        for (let i = 0; fiber && i < 25; i++, fiber = fiber.return) {
            const p = fiber.memoizedProps;
            if (p && typeof p.src === "string" && typeof p.url === "string" && p.format != null) {
                return {
                    src: p.src,
                    url: p.url,
                    width: p.width,
                    height: p.height,
                    format: coerceFormat(p.format)
                };
            }
        }
    } catch (err) {
        logger.error("findGifProps failed", err);
    }
    return null;
}

/**
 * Match the star's size/corner and sit directly beside it, whichever side of
 * the container it lives on (Discord puts it top-left in chat, and layouts vary).
 */
function alignBesideStar(btn: HTMLElement, star: HTMLElement, container: HTMLElement) {
    try {
        const rect = star.getBoundingClientRect();
        const box = container.getBoundingClientRect();
        if (rect.width < 14 || box.width < 48) return;

        btn.style.width = rect.width + "px";
        btn.style.height = rect.height + "px";
        btn.style.top = Math.max(rect.top - box.top, 0) + "px";
        btn.style.borderRadius = getComputedStyle(star).borderRadius;

        const gap = 6;
        if (rect.left + rect.width / 2 < box.left + box.width / 2) {
            // star on the left half -> we go to its right
            btn.style.left = (rect.right - box.left + gap) + "px";
            btn.style.right = "auto";
        } else {
            // star on the right half -> we go to its left
            btn.style.right = (box.right - rect.left + gap) + "px";
            btn.style.left = "auto";
        }
    } catch { /* keep CSS defaults */ }
}

/**
 * A native favorite star just mounted (they appear on hover).
 * In the picker: our button already exists on the tile (via the tile patch) - align it.
 * In chat: append our button to the star's positioned container.
 */
function handleStar(star: HTMLElement) {
    if (star.closest('[class*="channelAttachmentArea"]')) return;

    // picker tile: find our existing button on an ancestor and align it to the star
    if (star.closest('[class*="expressionPicker"]')) {
        let p = star.parentElement;
        for (let i = 0; p && i < 8; i++, p = p.parentElement) {
            const btn = p.querySelector(`:scope > .${BTN_CLASS}`) as HTMLElement | null;
            if (btn) {
                alignBesideStar(btn, star, p);
                return;
            }
        }
        return;
    }

    // chat: the star's offsetParent is the positioned media container it lives in
    const wrapper = (star.offsetParent instanceof HTMLElement && star.offsetParent.tagName !== "BODY"
        ? star.offsetParent
        : star.closest('[class*="imageWrapper"],[class*="visualMediaItemContainer"],[class*="mosaicItem"]')
    ) as HTMLElement | null;
    if (!wrapper) return;

    const existing = wrapper.querySelector(`:scope > .${BTN_CLASS}`) as HTMLElement | null;
    if (existing) {
        alignBesideStar(existing, star, wrapper);
        return;
    }

    const gif = findGifProps(star);
    if (!gif) return;

    if (getComputedStyle(wrapper).position === "static")
        wrapper.style.position = "relative";

    const btn = makeOverlayButton(gif, "chat");
    wrapper.appendChild(btn);
    alignBesideStar(btn, star, wrapper);
}

let observer: MutationObserver | null = null;
let pending: Set<HTMLElement> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scan(root: HTMLElement) {
    if (root.matches?.('[class*="gifFavoriteButton"]')) handleStar(root);
    root.querySelectorAll?.('[class*="gifFavoriteButton"]').forEach(el => handleStar(el as HTMLElement));
}

function flush() {
    flushTimer = null;
    const batch = pending;
    pending = null;
    if (!batch) return;
    try {
        batch.forEach(scan);
    } catch (err) {
        logger.error("chat button scan failed", err);
    }
}

export function startChatButtons() {
    if (observer) return;
    scan(document.body);
    observer = new MutationObserver(mutations => {
        if (!settings.store.chatButton) return;
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (!(n instanceof HTMLElement) || n.classList.contains(BTN_CLASS)) continue;
                (pending ??= new Set()).add(n);
            }
        }
        if (pending && flushTimer == null) flushTimer = setTimeout(flush, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

export function stopChatButtons() {
    observer?.disconnect();
    observer = null;
    if (flushTimer != null) clearTimeout(flushTimer);
    flushTimer = null;
    pending = null;
    document.querySelectorAll(`.${BTN_CLASS}`).forEach(el => el.remove());
}

/* ----------------------------- message context menu ----------------------------- */

function gifFromMessage(message: Message, url?: string, target?: HTMLElement): GifInput | null {
    if (!message.embeds.length && !message.attachments.length) return null;

    if (!url) {
        const wrapper = target?.closest('[class*="imageWrapper"]');
        url = wrapper?.querySelector("video")?.src ?? wrapper?.querySelector("img")?.src;
    }
    if (!url) return null;

    const c = cleanUrl(url);

    const embed = message.embeds.find(e => [
        e.url && cleanUrl(e.url),
        e.image && cleanUrl(e.image.url),
        e.image?.proxyURL && cleanUrl(e.image.proxyURL),
        e.video?.proxyURL && cleanUrl(e.video.proxyURL),
        e.thumbnail?.proxyURL && cleanUrl(e.thumbnail.proxyURL)
    ].includes(c));

    if (embed) {
        if (embed.video?.proxyURL) {
            return {
                src: embed.video.proxyURL,
                url: embed.provider?.name === "Tenor" ? embed.url ?? embed.video.url : embed.video.url,
                width: embed.video.width,
                height: embed.video.height,
                format: Format.VIDEO
            };
        }
        const img = embed.image ?? embed.thumbnail;
        if (img?.proxyURL) {
            return {
                src: img.proxyURL,
                url: img.url,
                width: img.width,
                height: img.height,
                format: Format.IMAGE
            };
        }
        return null;
    }

    const attachment = message.attachments.find(a =>
        cleanUrl(a.url) === c || (a.proxy_url && cleanUrl(a.proxy_url) === c));

    if (attachment) {
        const isVideo = attachment.content_type?.startsWith("video") ?? /\.(mp4|webm|mov)$/i.test(cleanUrl(attachment.url));
        return {
            src: attachment.proxy_url ?? attachment.url,
            url: attachment.url,
            width: attachment.width,
            height: attachment.height,
            format: isVideo ? Format.VIDEO : Format.IMAGE
        };
    }

    return null;
}

export const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    try {
        if (!settings.store.chatContextMenu || !props) return;

        const { message, itemSrc, itemHref, target } = props;
        if (!message) return;

        const gif = gifFromMessage(message, itemSrc ?? itemHref, target);
        if (!gif) return;

        const group = findGroupChildrenByChildId("open-native-link", children)
            ?? findGroupChildrenByChildId("copy-link", children)
            ?? children;

        if (group.some(child => child?.props?.id === "vc-gifo-chat")) return;

        group.push(
            <Menu.MenuItem id="vc-gifo-chat" label="GIF categories" key="vc-gifo-chat">
                {gifMenuItems(gif)}
            </Menu.MenuItem>
        );
    } catch (err) {
        logger.error("message context menu patch failed", err);
    }
};
