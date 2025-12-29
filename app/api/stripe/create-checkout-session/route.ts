// app/api/stripe/create-checkout-session/route.ts
export const runtime = "nodejs";

/** origin-only (scheme + host) */
function toOrigin(raw: string): string {
    const s = (raw ?? "").trim();
    if (!s) return "";
    const withScheme = s.startsWith("http") ? s : `https://${s}`;
    try {
        return new URL(withScheme).origin;
    } catch {
        return "";
    }
}

function getBaseUrl(req: Request): string {
    const envUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        process.env.VERCEL_URL ||
        "";

    const originFromEnv = toOrigin(envUrl);
    if (originFromEnv) return originFromEnv;

    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
}

async function stripePostForm(
    endpoint: string,
    secretKey: string,
    form: URLSearchParams,
    timeoutMs: number
) {
    const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        // ✅ Cloudflare Workers-native timeout (reliable here)
        signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();

    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {
        // keep raw text fallback
    }

    if (!res.ok) {
        const msg =
            json?.error?.message ||
            `Stripe error (${res.status}): ${text.slice(0, 400)}`;
        throw new Error(msg);
    }

    return json;
}

export async function POST(req: Request) {
    const startedAt = Date.now();

    try {
        // Read body (even if unused) so stream is consumed safely
        await req.json().catch(() => null);

        const secretKey = (process.env.STRIPE_SECRET_KEY ?? "").trim();
        if (!secretKey) {
            return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        const priceId = (process.env.STRIPE_PRICE_DEEP_PROOF ?? "").trim();
        const baseUrl = getBaseUrl(req);

        const success = new URL("/unlock", baseUrl);
        success.searchParams.set("paid", "1");
        success.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

        const cancel = new URL("/", baseUrl);
        cancel.searchParams.set("canceled", "1");
        cancel.searchParams.set("mode", "deep");

        const successUrl = success.toString();
        const cancelUrl = cancel.toString();

        console.log("create_checkout_enter", {
            baseUrl,
            hasPriceId: !!priceId,
            t: Date.now() - startedAt,
        });

        const form = new URLSearchParams();
        form.set("mode", "payment");
        form.set("success_url", successUrl);
        form.set("cancel_url", cancelUrl);
        form.set("allow_promotion_codes", "true");

        if (priceId) {
            form.set("line_items[0][price]", priceId);
            form.set("line_items[0][quantity]", "1");
        } else {
            form.set("line_items[0][quantity]", "1");
            form.set("line_items[0][price_data][currency]", "usd");
            form.set("line_items[0][price_data][unit_amount]", "2700");
            form.set(
                "line_items[0][price_data][product_data][name]",
                "Micro-Niche Engine — Full Validation"
            );
        }

        console.log("create_checkout_before_stripe", { t: Date.now() - startedAt });

        // ✅ This will actually timeout in Workers
        const session = await stripePostForm(
            "checkout/sessions",
            secretKey,
            form,
            12000
        );

        console.log("create_checkout_after_stripe", {
            ok: true,
            t: Date.now() - startedAt,
        });

        if (!session?.url) {
            throw new Error("Stripe session created but session.url was missing.");
        }

        return new Response(JSON.stringify({ url: session.url }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("create_checkout_error", { msg, t: Date.now() - startedAt });

        return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
