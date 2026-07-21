/*
 * Minimal stand-in for Vencord's "@api/index" - only the DataStore surface the
 * plugin uses. Backed by an in-memory map so tests can exercise persistence.
 */

const backing = new Map<string, unknown>();

export const DataStore = {
    async get<T>(key: string): Promise<T | undefined> {
        return backing.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
        backing.set(key, value);
    },
    async del(key: string): Promise<void> {
        backing.delete(key);
    },
    /** test-only: wipe everything between tests */
    __reset(): void {
        backing.clear();
    }
};
