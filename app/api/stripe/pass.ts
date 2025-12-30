// app/api/stripe/pass.ts
import Stripe from "stripe";

export type DeepPassStatus = {
    ok: boolean;
    paid: boolean;
    passExpiresAt?: number; // epoch ms
    secondsRemaining?: number;
    reason?: string;
};

function getPassHours(): number {
    const raw = (process.env.DEEP_PASS_HOURS ?? "").trim();
    const n = raw ? Number(raw) : 24;
    return Number.isFinite(n) && n > 0 ? n : 24;
}

function computePassExpiresAtFromSession(session: Stripe.Checkout.Session): number | undefined {
    const createdSec = typeof session.created === "number" ? session.created : undefined;
    if (!createdSec) return undefined;
    return (createdSec + getPassHours() * 3600) * 1000;
}

/**
 * IMPORTANT:
 * - Do not construct Stripe at module scope (CI builds don't have STRIPE_SECRET_KEY).
 * - Construct inside the function so env is only read at runtime.
 */
function getStripeClient(): Stripe | null {
    const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!secretKey) return null;

    // No apiVersion specified — Stripe will use package default.
    return new Stripe(secretKey);
}

export async function verifyDeepProofPass(sessionId: string): Promise<DeepPassStatus> {
    if (!sessionId || !sessionId.trim()) {
        return { ok: false, paid: false, reason: "Missing session_id" };
    }

    const stripe = getStripeClient();
    if (!stripe) {
        // ✅ Never throw at import/build time; return a structured failure.
        return { ok: false, paid: false, reason: "Missing STRIPE_SECRET_KEY" };
    }

    let session: Stripe.Checkout.Session;

    try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, paid: false, reason: `Stripe retrieve failed: ${msg}` };
    }

    const paid = session.payment_status === "paid" || session.status === "complete";
    const expiresAt = computePassExpiresAtFromSession(session);
    const secondsRemaining =
        typeof expiresAt === "number" ? Math.floor((expiresAt - Date.now()) / 1000) : undefined;

    if (!paid) {
        return {
            ok: false,
            paid: false,
            passExpiresAt: expiresAt,
            secondsRemaining,
            reason: "Not paid",
        };
    }

    if (typeof secondsRemaining === "number" && secondsRemaining <= 0) {
        return {
            ok: false,
            paid: false,
            passExpiresAt: expiresAt,
            secondsRemaining,
            reason: "Expired",
        };
    }

    return {
        ok: true,
        paid: true,
        passExpiresAt: expiresAt,
        secondsRemaining,
    };
}
