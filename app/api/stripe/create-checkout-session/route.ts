// app/api/stripe/create-checkout-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/mne/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Build base URL from request headers (proxy-safe).
 * Uses:
 * - https://micronicheengine.com
 * - https://*.workers.dev
 * - http://localhost:3000 (local dev)
 */
function getBaseUrl(req: NextRequest): string {
    const xfProto = req.headers.get("x-forwarded-proto");
    const proto = (xfProto ? xfProto.split(",")[0] : "https").trim();

    const xfHost = req.headers.get("x-forwarded-host");
    const host = (xfHost ? xfHost.split(",")[0] : req.headers.get("host"))?.trim();

    if (!host) return "https://micronicheengine.com";
    return `${proto}://${host}`.replace(/\/$/, "");
}

function mustEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

async function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> {
    const timeout = new Promise<never>((_, rej) => {
        setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([fn(), timeout]);
}

export async function POST(req: NextRequest) {
    try {
        const stripe = getStripe();

        // IMPORTANT:
        // Do NOT read req.json() here. Some runtimes / proxies can cause it to hang,
        // and we don't need any body for this endpoint.
        const priceId = mustEnv("STRIPE_PRICE_DEEP_PROOF");

        const baseUrl = getBaseUrl(req);
        const successUrl = `${baseUrl}/prototype?paid=1&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${baseUrl}/prototype?canceled=1`;

        console.log("checkout_debug", {
            host: req.headers.get("host"),
            xfHost: req.headers.get("x-forwarded-host"),
            xfProto: req.headers.get("x-forwarded-proto"),
            baseUrl,
            priceIdPrefix: `${priceId.slice(0, 8)}...`,
        });

        // Sanity check: price exists (fast-fail for test/live mismatch)
        try {
            await withTimeout("stripe.prices.retrieve", 6000, () => stripe.prices.retrieve(priceId));
        } catch (e: unknown) {
            const details = e instanceof Error ? e.message : String(e);
            return NextResponse.json(
                {
                    error:
                        "Stripe price lookup failed. Check STRIPE_PRICE_DEEP_PROOF and make sure you're in the correct mode (test vs live).",
                    details,
                },
                { status: 500 }
            );
        }

        const session = await withTimeout("stripe.checkout.sessions.create", 8000, () =>
            stripe.checkout.sessions.create({
                mode: "payment",
                success_url: successUrl,
                cancel_url: cancelUrl,
                line_items: [{ price: priceId, quantity: 1 }],
            })
        );

        // session.url can be null in some edge cases; guard it.
        if (!session.url) {
            return NextResponse.json(
                { error: "Stripe session created but no URL returned." },
                { status: 500 }
            );
        }

        return NextResponse.json({ url: session.url }, { status: 200 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("create-checkout-session error:", msg);
        return NextResponse.json({ error: msg || "Failed to create checkout session." }, { status: 500 });
    }
}
