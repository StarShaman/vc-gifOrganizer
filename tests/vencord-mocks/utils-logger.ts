/*
 * Minimal stand-in for Vencord's "@utils/Logger".
 */

export class Logger {
    constructor(public name: string, public color?: string) { }
    log = (..._args: unknown[]) => { };
    info = (..._args: unknown[]) => { };
    warn = (..._args: unknown[]) => { };
    error = (..._args: unknown[]) => { };
    debug = (..._args: unknown[]) => { };
}
