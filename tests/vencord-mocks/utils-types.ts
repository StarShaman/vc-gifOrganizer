/*
 * Minimal stand-in for Vencord's "@utils/types" used only by the test harness.
 */

export enum OptionType {
    STRING,
    NUMBER,
    BIGINT,
    BOOLEAN,
    SELECT,
    SLIDER,
    COMPONENT,
    CUSTOM
}

/** definePlugin just returns its definition unchanged in tests. */
export default function definePlugin<T>(def: T): T {
    return def;
}
