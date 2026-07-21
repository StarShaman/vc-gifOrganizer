/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FluxDispatcher } from "@webpack/common";

/**
 * Media hosts whose content is always treated as a GIF, even when it's served
 * as an mp4/webm (Discord proxies Tenor/Giphy media through its own CDN, but the
 * original host survives in the path).
 */
export const GIF_PROVIDERS = ["tenor", "giphy", "klipy", "gfycat"] as const;

/** Matches a GIF-provider host anywhere in a src/url (see {@link GIF_PROVIDERS}) */
export const GIF_HOST_RE = new RegExp(
    `(^|[./])(${GIF_PROVIDERS.join("|")})\\.(com|co)([/:?]|$)`,
    "i"
);

/** True if the embed provider name is one of our known GIF providers */
export function isGifProvider(name: string | undefined | null): boolean {
    const n = name?.toLowerCase?.() ?? "";
    return (GIF_PROVIDERS as readonly string[]).includes(n);
}

/** Dispatch a GIF picker search query to Discord */
export function dispatchPickerQuery(query: string) {
    FluxDispatcher.dispatch({ type: "GIF_PICKER_QUERY", query });
}

/** Ensure an element is a positioned ancestor so absolutely-placed children anchor to it */
export function ensureRelative(el: HTMLElement) {
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
}
