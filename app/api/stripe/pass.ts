// app/api/stripe/pass.ts

export type DeepPassResult =
    | { ok: true; passExpiresAt: number; secondsRemaining: number }
    | { ok: false; reason: string };

const cache = new Map<string, { value: DeepPassResult; expiresAt: number }>();

function nowMs() {
    return Date.now();
}

function cacheGet(k: string): DeepPassResult | null {
    const v = cache.get(k);
    if (!v) return null;
    if (nowMs() > v.expiresAt) {
        cache.delete(k);
        return null;
    }
    return v.value;
}

function cacheSet(k: string, value: DeepPassResult, ttlMs: number) {
    cache.set(k, { value, expiresAt: nowMs() + ttlMs });
}

function clampSeconds(s: number) {
    if (!Number.isFinite(s)) return 0;
    return Math.max(0, Math.floor(s));
}

function getPassHours(): number {
    const n = Number(process.env.DEEP_PASS_HOURS ?? 24);
    return Number.isFinite(n) && n > 0 ? n : 24;
}

/**
 * verifyDeepProofPass
 * Uses the SAME truth source as your frontend (verify-session),
 * then layers the "expires in N hours" rule on top.
 */
export async function verifyDeepProofPass(sessionId: string): Promise<DeepPassResult> {
    const sid = (sessionId ?? "").trim();
    if (!sid) return { ok: false, reason: "Missing session id." };

    // cache (60s)
    const cached = cacheGet(sid);
    if (cached) return cached;

    // We need an absolute URL server-side. Use APP_URL / NEXT_PUBLIC_APP_URL if present.
    const base =
        (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").trim().replace(/\/+$/, "");

    if (!base) {
        const out: DeepPassResult = { ok: false, reason: "Missing APP_URL/NEXT_PUBLIC_APP_URL for server verification." };
        cacheSet(sid, out, 15_000);
        return out;
    }

    let payload: any = null;
    try {
        const r = await fetch(
            `${base}/api/stripe/verify-session?session_id=${encodeURIComponent(sid)}`,
            { method: "GET", signal: AbortSignal.timeout(7000) }
        );
        const txt = await r.text();
        try {
            payload = JSON.parse(txt);
        } catch {
            payload = null;
        }

        if (!r.ok) {
            const msg =
                (payload && (payload.error || payload.message)) ||
                `verify-session failed (${r.status})`;
            const out: DeepPassResult = { ok: false, reason: String(msg) };
            cacheSet(sid, out, 15_000);
            return out;
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : "verify-session request failed.";
        const out: DeepPassResult = { ok: false, reason: msg };
        cacheSet(sid, out, 15_000);
        return out;
    }

    const paid = !!payload?.paid;
    if (!paid) {
        const out: DeepPassResult = { ok: false, reason: "Payment not completed." };
        cacheSet(sid, out, 30_000);
        return out;
    }

    // If verify-session already returns secondsRemaining/passExpiresAt, prefer it.
    // Otherwise apply our own window based on "now".
    const passHours = getPassHours();

    const passExpiresAt =
        typeof payload?.passExpiresAt === "number"
            ? payload.passExpiresAt
            : nowMs() + passHours * 60 * 60 * 1000;

    const secondsRemaining =
        typeof payload?.secondsRemaining === "number"
            ? clampSeconds(payload.secondsRemaining)
            : clampSeconds((passExpiresAt - nowMs()) / 1000);

    if (secondsRemaining <= 0) {
        const out: DeepPassResult = { ok: false, reason: "Pass expired." };
        cacheSet(sid, out, 30_000);
        return out;
    }

    const ok: DeepPassResult = { ok: true, passExpiresAt, secondsRemaining };
    cacheSet(sid, ok, 60_000);
    return ok;
}
