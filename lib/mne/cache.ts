// lib/mne/cache.ts
type CacheEntry = { exp: number; value: string };

const mem = new Map<string, CacheEntry>();

function nowMs() {
  return Date.now();
}

function asCacheUrl(key: string) {
  // Cache API keys must be Requests/URLs.
  return `https://mne-cache.local/${encodeURIComponent(key)}`;
}

export async function cacheGet(key: string): Promise<string | null> {
  // Cloudflare Cache API (Workers)
  const anyGlobal = globalThis as any;
  const cfCaches = anyGlobal?.caches?.default;

  if (cfCaches) {
    const req = new Request(asCacheUrl(key));
    const hit = await cfCaches.match(req);
    if (!hit) return null;
    return await hit.text();
  }

  // Node/local fallback
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.exp <= nowMs()) {
    mem.delete(key);
    return null;
  }
  return hit.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number) {
  const anyGlobal = globalThis as any;
  const cfCaches = anyGlobal?.caches?.default;

  if (cfCaches) {
    const req = new Request(asCacheUrl(key));
    const res = new Response(value, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Cache API honors cache-control for freshness semantics
        "Cache-Control": `max-age=${Math.max(1, ttlSeconds)}`,
      },
    });
    await cfCaches.put(req, res.clone());
    return;
  }

  mem.set(key, { value, exp: nowMs() + ttlSeconds * 1000 });
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet(key);
  if (hit) return JSON.parse(hit) as T;

  const fresh = await factory();
  await cacheSet(key, JSON.stringify(fresh), ttlSeconds);
  return fresh;
}
