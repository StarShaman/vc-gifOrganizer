/*
 * Minimal stand-in for Vencord's "@api/Settings". definePluginSettings in the
 * real client returns a reactive proxy; for unit tests we only need a plain
 * `.store` object seeded with each setting's declared default so the plugin
 * logic can read/write settings synchronously.
 */

import { OptionType } from "./utils-types";

interface OptionDef {
    type: OptionType;
    default?: unknown;
    options?: { value: unknown; default?: boolean; }[];
}

export function definePluginSettings<D extends Record<string, OptionDef>>(defs: D) {
    const store: Record<string, unknown> = {};

    for (const [key, def] of Object.entries(defs)) {
        if (def.type === OptionType.SELECT)
            store[key] = def.options?.find(o => o.default)?.value;
        else
            store[key] = def.default;
    }

    return { store, def: defs } as { store: Record<string, any>; def: D; };
}
