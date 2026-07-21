/*
 * Minimal stand-in for "@vencord/discord-types" - the plugin only uses these as
 * type-level imports, so empty interfaces are enough for the test harness.
 */

export interface Embed { [key: string]: any; }
export interface Message { [key: string]: any; }
export interface RenderModalProps { [key: string]: any; }
