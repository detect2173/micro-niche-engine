// lib/mne/cache.ts
type CacheEntry<T> = {
    value: T;
    expiresAt: number; // epoch ms
};

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
    const hit = store.get(key);
    if (!hit) return undefined;

    if (Date.now() > hit.expiresAt) {
        store.delete(key);
        return undefined;
    }

    return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key: string): void {
    store.delete(key);
}

export function cacheClear(): void {
    store.clear();
}
