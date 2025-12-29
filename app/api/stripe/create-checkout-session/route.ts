import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function safeJson<T>(v: unknown): T | null {
    return (typeof v === "object" && v !== null ? (v as T) : null);
}

function appendQuery(url: string, query: Record<string, string>) {
    const hasQuery = url.includes("?");
    const sep = hasQuery ? "&" : "?";
    const qs = new URLSearchParams(query).toString();
    return `${url}${sep}${qs}`;
}

async function stripeGet(path: string) {
    const key = mustEnv("STRIPE_SECRET_KEY");
    const res = await fetch(`https://api.stripe.com${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${key}` },
    });

    const text = await res.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }

    if (!res.ok) return { ok: false, status: res.status, json };
    return { ok: true, status: res.status, json };
}

async function stripePost(path: string, body: URLSearchParams) {
    const key = mustEnv("STRIPE_SECRET_KEY");
    const res = await fetch(`https://api.stripe.com${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });

    const text = await res.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }

    if (!res.ok) return { ok: false, status: res.status, json };
    return { ok: true, status: res.status, json };
}

export async function POST(req: NextRequest) {
    try {
        // Body is optional. Supports:
        // { priceId?: string, returnPath?: string }
        const rawBody = await req.json().catch(() => ({}));
        const body = safeJson<Record<string, unknown>>(rawBody) ?? {};

        const priceId = (typeof body.priceId === "string" && body.priceId.trim())
            ? body.priceId.trim()
            : mustEnv("STRIPE_PRICE_DEEP_PROOF");

        // IMPORTANT: default to the root route, since your app renders on "/"
        const returnPath =
            typeof body.returnPath === "string" && body.returnPath.trim()
                ? body.returnPath.trim()
                : "/";

        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

        // Sanity check: price exists (helps catch wrong mode mix-ups)
        const priceCheck = await stripeGet(`/v1/prices/${encodeURIComponent(priceId)}`);
        if (!priceCheck.ok) {
            return NextResponse.json(
                {
                    error: "Stripe price lookup failed. Check STRIPE_PRICE_DEEP_PROOF + mode (test vs live).",
                    details: priceCheck.json,
                },
                { status: 500 }
            );
        }

        // Build redirect URLs
        const successBase = `${appUrl}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`;
        const cancelBase = `${appUrl}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`;

        const successUrl = appendQuery(successBase, {
            paid: "1",
            session_id: "{CHECKOUT_SESSION_ID}",
        });

        const cancelUrl = appendQuery(cancelBase, {
            canceled: "1",
        });

        const params = new URLSearchParams();
        params.set("mode", "payment");
        params.set("success_url", successUrl);
        params.set("cancel_url", cancelUrl);

        params.set("line_items[0][price]", priceId);
        params.set("line_items[0][quantity]", "1");

        // Optional but useful:
        params.set("allow_promotion_codes", "true");

        const created = await stripePost("/v1/checkout/sessions", params);
        if (!created.ok) {
            return NextResponse.json(
                { error: "Failed to create Stripe Checkout session.", details: created.json },
                { status: 500 }
            );
        }

        const createdJson = safeJson<{ url?: string; id?: string }>(created.json) ?? {};
        return NextResponse.json({ url: createdJson.url, id: createdJson.id });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
