// app/api/stripe/pass.ts

type PassOk = {
    ok: true;
    passExpiresAt: number; // ms epoch
    secondsRemaining: number;
};

type PassFail = {
    ok: false;
    reason: string;
};

export type DeepPassResult = PassOk | PassFail;

// Tiny in-memory cache (per-worker instance). Good enough for now.
const cache = new Map<string, { value: DeepPassResult; expiresAt: number }>();

function nowMs() {
    return Date.now();
}

function clampSeconds(s: number) {
    if (!Number.isFinite(s)) return 0;
    return Math.max(0, Math.floor(s));
}

function getPassHours(): number {
    const n = Number(process.env.DEEP_PASS_HOURS ?? 24);
    return Number.isFinite(n) && n > 0 ? n : 24;
}

function cacheGet(sessionId: string): DeepPassResult | null {
    const item = cache.get(sessionId);
    if (!item) return null;
    if (nowMs() > item.expiresAt) {
        cache.delete(sessionId);
        return null;
    }
    return item.value;
}

function cacheSet(sessionId: string, value: DeepPassResult, ttlMs: number) {
    cache.set(sessionId, { value, expiresAt: nowMs() + ttlMs });
}

async function stripeGetCheckoutSession(sessionId: string) {
    const secret = (process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!secret) {
        throw new Error("Missing STRIPE_SECRET_KEY");
    }

    // Stripe REST: GET /v1/checkout/sessions/{id}
    const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${secret}`,
        },
        // Hard timeout so it never “hangs”
        signal: AbortSignal.timeout(7000),
    });

    const text = await res.text();

    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {
        // keep null; handled below
    }

    if (!res.ok) {
        const msg =
            (json && typeof json.error?.message === "string" && json.error.message) ||
            `Stripe request failed (${res.status})`;
        throw new Error(msg);
    }

    return json;
}

/**
 * verifyDeepProofPass
 * - sessionId must be a valid Stripe Checkout Session id
 * - Must be paid
 * - Pass expires DEEP_PASS_HOURS after session.created (or now if missing)
 */
export async function verifyDeepProofPass(sessionId: string): Promise<DeepPassResult> {
    const id = (sessionId ?? "").trim();
    if (!id) return { ok: false, reason: "Missing session id." };

    // Cache hit (60s)
    const cached = cacheGet(id);
    if (cached) return cached;

    let session: any;
    try {
        session = await stripeGetCheckoutSession(id);
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Stripe verification failed.";
        const out: DeepPassResult = { ok: false, reason: msg };
        cacheSet(id, out, 15_000); // short negative cache
        return out;
    }

    const paymentStatus = typeof session?.payment_status === "string" ? session.payment_status : "";
    if (paymentStatus !== "paid") {
        const out: DeepPassResult = { ok: false, reason: "Payment not completed." };
        cacheSet(id, out, 30_000);
        return out;
    }

    const passHours = getPassHours();

    // Stripe session.created is seconds since epoch
    const createdSec =
        typeof session?.created === "number" ? session.created : Math.floor(Date.now() / 1000);
    const createdMs = createdSec * 1000;

    const passExpiresAt = createdMs + passHours * 60 * 60 * 1000;
    const secondsRemaining = clampSeconds((passExpiresAt - nowMs()) / 1000);

    if (secondsRemaining <= 0) {
        const out: DeepPassResult = { ok: false, reason: "Pass expired." };
        cacheSet(id, out, 30_000);
        return out;
    }

    const ok: DeepPassResult = { ok: true, passExpiresAt, secondsRemaining };
    cacheSet(id, ok, 60_000);
    return ok;
}
