// app/api/stripe/pass.ts
import type Stripe from "stripe";
import { stripe } from "@/lib/mne/stripe";

export type DeepPassStatus = {
    ok: boolean;
    paid: boolean;
    passExpiresAt?: number; // epoch ms
    secondsRemaining?: number;
    reason?: string;
};

function getPassHours(): number {
    const raw = process.env.DEEP_PASS_HOURS;
    const n = raw ? Number(raw) : 24;
    return Number.isFinite(n) && n > 0 ? n : 24;
}

function computePassExpiresAtFromSession(session: Stripe.Checkout.Session): number | undefined {
    // Stripe 'created' is seconds since epoch
    const createdSec = typeof session.created === "number" ? session.created : undefined;
    if (!createdSec) return undefined;
    return (createdSec + getPassHours() * 3600) * 1000;
}

export async function verifyDeepProofPass(sessionId: string): Promise<DeepPassStatus> {
    if (!sessionId || !sessionId.trim()) {
        return { ok: false, paid: false, reason: "Missing session_id" };
    }

    let session: Stripe.Checkout.Session;
    try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, paid: false, reason: `Stripe retrieve failed: ${msg}` };
    }

    const paid = session.payment_status === "paid";
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
