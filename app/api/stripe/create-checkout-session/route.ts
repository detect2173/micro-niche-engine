// app/api/stripe/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/mne/stripe";

export const runtime = "nodejs";

function getBaseUrl(req: Request): string {
    // Prefer explicit env if set (best for prod)
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.VERCEL_URL;

    if (envUrl) {
        const u = envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
        return u.replace(/\/+$/, "");
    }

    // Fallback to request host
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
}

export async function POST(req: Request) {
    try {
        const baseUrl = getBaseUrl(req);

        const successUrl = `${baseUrl}/?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${baseUrl}/`;

        const priceId = process.env.STRIPE_PRICE_ID?.trim();

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            success_url: successUrl,
            cancel_url: cancelUrl,
            line_items: priceId
                ? [{ price: priceId, quantity: 1 }]
                : [
                    {
                        quantity: 1,
                        price_data: {
                            currency: "usd",
                            unit_amount: 2700,
                            product_data: {
                                name: "Micro-Niche Engine — Full Validation",
                            },
                        },
                    },
                ],
            allow_promotion_codes: true,
        });

        return NextResponse.json({ url: session.url });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
