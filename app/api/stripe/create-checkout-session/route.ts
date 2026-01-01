// app/api/stripe/create-checkout-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/mne/stripe";

export const runtime = "nodejs";

/**
 * Build base URL from request headers (proxy-safe).
 * This avoids localhost poisoning and automatically uses:
 * - https://micronicheengine.com
 * - https://*.workers.dev
 * - http://localhost:3000 (local dev)
 */
function getBaseUrl(req: NextRequest): string {
    const xfProto = req.headers.get("x-forwarded-proto");
    const proto = (xfProto ? xfProto.split(",")[0] : "https").trim();

    const xfHost = req.headers.get("x-forwarded-host");
    const host = (xfHost ? xfHost.split(",")[0] : req.headers.get("host"))?.trim();

    // Safe fallback (should almost never happen in real traffic)
    if (!host) return "https://micronicheengine.com";

    return `${proto}://${host}`.replace(/\/$/, "");
}

function mustEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

export async function POST(req: NextRequest) {
    try {
        // ✅ Lazy runtime-only initialization (CI-safe)
        const stripe = getStripe();

        // Body is optional; priceId override is allowed
        const body = await req.json().catch(() => ({} as any));
        const priceId = (body?.priceId as string) || mustEnv("STRIPE_PRICE_DEEP_PROOF");

        const baseUrl = getBaseUrl(req);
        const successUrl = `${baseUrl}/prototype?paid=1&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${baseUrl}/prototype?canceled=1`;

        // TEMP DEBUG (remove once verified)
        console.log("stripe_redirect_debug", {
            host: req.headers.get("host"),
            xfHost: req.headers.get("x-forwarded-host"),
            xfProto: req.headers.get("x-forwarded-proto"),
            baseUrl,
            successUrl,
            cancelUrl,
            priceId,
        });

        // Optional sanity check: ensure price exists (helps catch test/live mixups)
        // If you don’t want this extra API call, remove this block.
        try {
            await stripe.prices.retrieve(priceId);
        } catch (e: any) {
            return NextResponse.json(
                {
                    error:
                        "Stripe price lookup failed. Check STRIPE_PRICE_DEEP_PROOF and make sure you're using the correct mode (test vs live).",
                    details: e?.message ?? String(e),
                },
                { status: 500 }
            );
        }

        // Create Checkout Session (SDK)
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            success_url: successUrl,
            cancel_url: cancelUrl,
            line_items: [{ price: priceId, quantity: 1 }],
            // allow_promotion_codes: true,
        });

        if (!session?.url) {
            return NextResponse.json(
                { error: "Stripe session created but no URL was returned." },
                { status: 500 }
            );
        }

        return NextResponse.json({ url: session.url, id: session.id });
    } catch (err: any) {
        return NextResponse.json(
            { error: err?.message || "Unknown error" },
            { status: 500 }
        );
    }
}
