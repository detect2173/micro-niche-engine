// app/api/stripe/pass.ts
export type PassVerifyResult =
    | {
    ok: true;
    paid: true;
    passExpiresAt: number;        // epoch ms (UI-friendly)
    passExpiresAtIso: string;     // optional ISO
    secondsRemaining: number;     // integer >= 0
    passHours: number;
}
    | {
    ok: true;
    paid: false;
    reason: string;
    payment_status?: string;
    passHours: number;
}
    | {
    ok: false;
    paid: false;
    reason: string;
    passHours: number;
};

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

async function stripeGet(path: string) {
    const key = mustEnv("STRIPE_SECRET_KEY");
    const res = await fetch(`https://api.stripe.com${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
    });

    const text = await res.text();
    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }

    if (!res.ok) return { ok: false as const, status: res.status, json };
    return { ok: true as const, status: res.status, json };
}

export async function verifyDeepProofPass(opts: {
    sessionId: string;
    expectedPriceId: string;
    passHours?: number;
}): Promise<PassVerifyResult> {
    const passHours = opts.passHours ?? 24;

    try {
        const sessionId = (opts.sessionId || "").trim();
        if (!sessionId) {
            return { ok: true, paid: false, reason: "missing_session_id", passHours };
        }

        const sid = encodeURIComponent(sessionId);

        // 1) Lookup session
        const sess = await stripeGet(`/v1/checkout/sessions/${sid}`);
        if (!sess.ok) {
            return { ok: true, paid: false, reason: "session_lookup_failed", passHours };
        }

        const paymentStatus = sess.json?.payment_status ?? "unknown";
        if (paymentStatus !== "paid") {
            return {
                ok: true,
                paid: false,
                reason: "not_paid",
                payment_status: paymentStatus,
                passHours,
            };
        }

        // 2) Validate line item price
        const li = await stripeGet(`/v1/checkout/sessions/${sid}/line_items?limit=10`);
        if (!li.ok) {
            return { ok: true, paid: false, reason: "line_items_lookup_failed", passHours };
        }

        const matchesPrice = (li.json?.data || []).some(
            (x: any) => x?.price?.id === opts.expectedPriceId
        );

        if (!matchesPrice) {
            return { ok: true, paid: false, reason: "wrong_price", passHours };
        }

        // 3) Compute expiry from session creation (unix seconds)
        const createdSec = Number(sess.json?.created ?? 0);
        if (!createdSec) {
            // paid, but cannot compute expiry
            return { ok: true, paid: false, reason: "missing_created_timestamp", passHours };
        }

        const passExpiresAt =
            createdSec * 1000 + passHours * 60 * 60 * 1000;

        const secondsRemaining = Math.max(
            0,
            Math.floor((passExpiresAt - Date.now()) / 1000)
        );

        if (secondsRemaining <= 0) {
            return { ok: true, paid: false, reason: "expired", passHours };
        }

        return {
            ok: true,
            paid: true,
            passExpiresAt,
            passExpiresAtIso: new Date(passExpiresAt).toISOString(),
            secondsRemaining,
            passHours,
        };
    } catch (err: any) {
        return {
            ok: false,
            paid: false,
            reason: err?.message || "error",
            passHours,
        };
    }
}
