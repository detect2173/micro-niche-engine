import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function stripeGet(path: string) {
  const key = mustEnv("STRIPE_SECRET_KEY");
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, json };
  }
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
  if (!res.ok) {
    return { ok: false, status: res.status, json };
  }
  return { ok: true, status: res.status, json };
}

export async function POST(req: NextRequest) {
  try {
    // Optional override (future-proof). Right now we default to env.
    const body = await req.json().catch(() => ({} as any));
    const priceId = (body?.priceId as string) || mustEnv("STRIPE_PRICE_DEEP_PROOF");

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

    // Basic sanity check: price exists (helps catch wrong mode mixups)
    const priceCheck = await stripeGet(`/v1/prices/${encodeURIComponent(priceId)}`);
    if (!priceCheck.ok) {
      return NextResponse.json(
          { error: "Stripe price lookup failed. Check STRIPE_PRICE_DEEP_PROOF + mode (test vs live).", details: priceCheck.json },
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

    // Optional but useful:
    params.set("allow_promotion_codes", "true");

    const created = await stripePost("/v1/checkout/sessions", params);
    if (!created.ok) {
      return NextResponse.json(
          { error: "Failed to create Stripe Checkout session.", details: created.json },
          { status: 500 }
      );
    }

    return NextResponse.json({ url: created.json.url, id: created.json.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
