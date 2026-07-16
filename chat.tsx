/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Embed, Message } from "@vencord/discord-types";
import { ContextMenuApi, Menu, MessageStore } from "@webpack/common";

import { GifMenu, gifMenuItems } from "./components";
import { settings } from "./settings";
import { GifInput, logger } from "./store";
import { Format } from "./types";

const BTN_ATTR = "data-vc-gifo";

const FOLDER_PATHS = `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"
    d="M3 6a2 2 0 0 1 2-2h3.59a1 1 0 0 1 .7.3L10.7 5.7a1 1 0 0 0 .71.3H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>
<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 10.5v5M9.5 13h5"/>`;

const FOLDER_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${FOLDER_PATHS}</svg>`;

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

/** Tenor/Giphy/gifv embeds are GIFs that happen to be mp4s - always treated as GIFs */
function isGifLikeEmbed(e: Embed | undefined | null): boolean {
    if (!e) return false;
    return (e as any).type === "gifv"
        || ["tenor", "giphy"].includes(e.provider?.name?.toLowerCase?.() ?? "");
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
 * A native favorite star just mounted (they appear on hover, in chat and in the
 * picker alike). Clone it into a folder button and append the clone AFTER it in
 * the same container: the clone inherits Discord's exact classes, so size,
 * corner, margins and hover behavior always match the star - no geometry math.
 * Trailing appendChild only; React tolerates trailing foreign nodes.
 */
function handleStar(star: HTMLElement) {
    if (star.hasAttribute(BTN_ATTR)) return; // one of our own clones
    if (star.closest('[class*="channelAttachmentArea"]')) return;

    const inPicker = star.closest('[class*="expressionPicker"]') != null;
    if (!inPicker && !settings.store.chatButton) return;

    const parent = star.parentElement;
    if (!parent) return;

    const gif = findGifProps(star);
    if (!gif) return;

    const existing = parent.querySelector(`:scope > [${BTN_ATTR}]`) as HTMLElement | null;
    if (existing) {
        if (existing.getAttribute(BTN_ATTR) === gif.url) return;
        existing.remove(); // container recycled for a different gif -> rebuild
    }

    const btn = star.cloneNode(true) as HTMLElement;
    btn.setAttribute(BTN_ATTR, gif.url);
    btn.setAttribute("aria-label", "Add GIF to category");
    btn.removeAttribute("id");

    const svg = btn.querySelector("svg");
    if (svg) svg.innerHTML = FOLDER_PATHS;
    else btn.innerHTML = FOLDER_SVG;

    btn.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        openGifMenu(e, gif, btn);
    });

    // if the star is corner-positioned (rather than a flex-row item),
    // shift the clone right beside it - same box metrics, so this is exact
    if (getComputedStyle(star).position === "absolute") {
        btn.style.left = (star.offsetLeft + star.offsetWidth + 6) + "px";
        btn.style.top = star.offsetTop + "px";
        btn.style.right = "auto";
    }

    parent.appendChild(btn);
}

/* ------------------------------ on-video button ------------------------------ */

/**
 * Plain videos (uploads, proxied video embeds) have no favorite star to ride on,
 * so when video support is enabled we add our own overlay button. GIF-like
 * videos (Tenor/Giphy/gifv render as <video> too) are left to the star flow.
 */
function handleVideo(el: Element) {
    try {
        if (!settings.store.videoSupport || !(el instanceof HTMLVideoElement)) return;
        if (el.closest('[class*="expressionPicker"],[class*="channelAttachmentArea"]')) return;

        const wrapper = (el.closest(
            '[class*="mosaicItem"],[class*="videoAttachment"],[class*="embedVideo"],[class*="imageWrapper"],[class*="visualMediaItemContainer"]'
        ) ?? el.parentElement) as HTMLElement | null;
        if (!wrapper) return;
        if (wrapper.querySelector(`[${BTN_ATTR}],[class*="gifFavoriteButton"]`)) return;

        const li = el.closest('li[id^="chat-messages-"]');
        if (!li) return;
        const [channelId, messageId] = li.id.split("-").slice(2);
        if (!channelId || !messageId) return;
        const message: Message | undefined = MessageStore.getMessage(channelId, messageId);
        if (!message) return;

        const src = el.currentSrc || el.src;
        const cleanSrc = src && !src.startsWith("blob:") ? cleanUrl(src) : null;

        // if this <video> belongs to a gif-like embed, the star flow owns it
        const srcEmbed = cleanSrc ? message.embeds.find(e => [e.url, e.video?.proxyURL, e.video?.url]
            .filter(Boolean).map(u => cleanUrl(u!)).includes(cleanSrc)) : null;
        if (srcEmbed ? isGifLikeEmbed(srcEmbed) : (!message.attachments.length && message.embeds.length > 0 && message.embeds.every(isGifLikeEmbed))) return;

        let gif: GifInput | null = cleanSrc ? gifFromMessage(message, src, el) : null;

        if (!gif) {
            const vids = message.attachments.filter(a => a.content_type?.startsWith("video"));
            if (vids.length === 1) {
                gif = {
                    src: vids[0].proxy_url ?? vids[0].url,
                    url: vids[0].url,
                    width: vids[0].width,
                    height: vids[0].height,
                    format: Format.VIDEO
                };
            }
        }
        if (!gif) {
            const vembeds = message.embeds.filter(e => e.video?.proxyURL && !isGifLikeEmbed(e));
            if (vembeds.length === 1) {
                const v = vembeds[0].video!;
                gif = { src: v.proxyURL!, url: v.url ?? v.proxyURL!, width: v.width, height: v.height, format: Format.VIDEO };
            }
        }
        if (!gif) return;

        if (getComputedStyle(wrapper).position === "static")
            wrapper.style.position = "relative";

        const btn = document.createElement("div");
        btn.className = "vc-gifo-video-btn";
        btn.setAttribute(BTN_ATTR, gif.url);
        btn.setAttribute("role", "button");
        btn.setAttribute("aria-label", "Add video to category");
        btn.innerHTML = FOLDER_SVG;

        const g = gif;
        btn.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
        btn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            openGifMenu(e, g, btn);
        });

        wrapper.appendChild(btn);
    } catch (err) {
        logger.error("handleVideo failed", err);
    }
}

let observer: MutationObserver | null = null;
let pending: Set<HTMLElement> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scan(root: HTMLElement) {
    if (root.matches?.('[class*="gifFavoriteButton"]')) handleStar(root);
    root.querySelectorAll?.('[class*="gifFavoriteButton"]').forEach(el => handleStar(el as HTMLElement));
    if (settings.store.videoSupport) {
        if (root.matches?.("video")) handleVideo(root);
        root.querySelectorAll?.("video").forEach(handleVideo);
    }
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
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (!(n instanceof HTMLElement) || n.hasAttribute(BTN_ATTR)) continue;
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
    document.querySelectorAll(`[${BTN_ATTR}]`).forEach(el => el.remove());
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
            if (!isGifLikeEmbed(embed) && !settings.store.videoSupport) return null;
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
        if (isVideo && !settings.store.videoSupport) return null;
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
