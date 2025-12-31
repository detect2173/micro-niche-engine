// app/api/stripe/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/mne/stripe";

export const runtime = "nodejs";

function getBaseUrl(req: Request): string {
    // Prefer env if you have it; otherwise infer from request
    const envBase = (process.env.NEXT_PUBLIC_BASE_URL ?? "").trim();
    if (envBase) return envBase.replace(/\/+$/, "");
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
}

export async function POST(req: Request) {
    try {
        const baseUrl = getBaseUrl(req);

        const priceId = (process.env.STRIPE_DEEP_PRICE_ID ?? "").trim();
        if (!priceId) {
            return NextResponse.json(
                { error: "Missing STRIPE_DEEP_PRICE_ID env var." },
                { status: 500 }
            );
        }

        // IMPORTANT: do NOT URL-encode the literal {CHECKOUT_SESSION_ID}
        const successUrl =
            `${baseUrl}/unlock?paid=1&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${baseUrl}/?canceled=1`;

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            allow_promotion_codes: true,
        });

        return NextResponse.json({ url: session.url });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: `create checkout failed: ${msg}` }, { status: 500 });
    }
}
