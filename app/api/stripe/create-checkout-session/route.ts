import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * Cloudflare/OpenNext sometimes makes req.url look like localhost internally.
 * So derive the PUBLIC URL from headers.
 */
function getPublicBaseUrl(req: NextRequest) {
  // 1) Cloudflare often includes cf-visitor: {"scheme":"https"}
  const cfVisitor = req.headers.get("cf-visitor");
  let protoFromCf: string | null = null;
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor);
      if (parsed?.scheme) protoFromCf = String(parsed.scheme);
    } catch {
      // ignore
    }
  }

  // 2) Standard proxies
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");

  // 3) Fallbacks
  const host = req.headers.get("host");
  const proto = (protoFromCf || xfProto || "https").split(",")[0].trim();
  const finalHost = (xfHost || host || "").split(",")[0].trim();

  if (!finalHost) {
    // absolute last resort: whatever Next gave us
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  }

  return `${proto}://${finalHost}`;
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
  let json: any;
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
    const body = await req.json().catch(() => ({} as any));
    const priceId = (body?.priceId as string) || mustEnv("STRIPE_PRICE_DEEP_PROOF");

    // PUBLIC base url (micronicheengine.com)
    const appUrl = getPublicBaseUrl(req).replace(/\/$/, "");

    // sanity: verify price exists
    const priceCheck = await stripeGet(`/v1/prices/${encodeURIComponent(priceId)}`);
    if (!priceCheck.ok) {
      return NextResponse.json(
          {
            error: "Stripe price lookup failed. Check STRIPE_PRICE_DEEP_PROOF + test/live mode.",
            details: priceCheck.json,
          },
          { status: 500 }
      );
    }

    const successUrl = `${appUrl}/prototype?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/prototype?canceled=1`;

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("allow_promotion_codes", "true");

    const created = await stripePost("/v1/checkout/sessions", params);
    if (!created.ok) {
      return NextResponse.json(
          { error: "Failed to create Stripe Checkout session.", details: created.json },
          { status: 500 }
      );
    }

    // include debug so we can see exactly what base URL was used
    return NextResponse.json({
      url: created.json.url,
      id: created.json.id,
      appUrlUsed: appUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
