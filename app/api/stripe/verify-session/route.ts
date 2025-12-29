// app/api/stripe/verify-session/route.ts
export const runtime = "nodejs";

async function stripeGet(path: string, secretKey: string, timeoutMs = 15000) {
    const res = await fetch(`https://api.stripe.com${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${secretKey}` },
        // ✅ Workers-native timeout
        signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();
    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {}

    if (!res.ok) {
        const msg =
            json?.error?.message || `Stripe error (${res.status}): ${text.slice(0, 250)}`;
        throw new Error(msg);
    }

    return json;
}

export async function GET(req: Request) {
    try {
        const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
        if (!secretKey) {
            return new Response(JSON.stringify({ ok: false, reason: "Missing STRIPE_SECRET_KEY" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        const { searchParams } = new URL(req.url);
        const sessionId = (searchParams.get("session_id") ?? "").trim();

        if (!sessionId) {
            return new Response(JSON.stringify({ ok: false, reason: "Missing session_id" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const session = await stripeGet(
            `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
            secretKey
        );

        const paid = session?.payment_status === "paid" || session?.status === "complete";

        return new Response(
            JSON.stringify({
                ok: true,
                paid: !!paid,
                status: session?.status ?? null,
                payment_status: session?.payment_status ?? null,
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("verify-session failed:", msg);
        return new Response(JSON.stringify({ ok: false, reason: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
