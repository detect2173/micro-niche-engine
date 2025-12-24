import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";


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
  if (!res.ok) return { ok: false, status: res.status, json };
  return { ok: true, status: res.status, json };
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) return NextResponse.json({ paid: false, reason: "missing_session_id" }, { status: 200 });

    const expectedPriceId = mustEnv("STRIPE_PRICE_DEEP_PROOF");

    const sess = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (!sess.ok) return NextResponse.json({ paid: false, reason: "session_lookup_failed", details: sess.json }, { status: 200 });

    // payment_status is "paid" when completed successfully
    if (sess.json.payment_status !== "paid") {
      return NextResponse.json({ paid: false, reason: "not_paid", payment_status: sess.json.payment_status }, { status: 200 });
    }

    // Validate the line item price
    const li = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=10`);
    if (!li.ok) return NextResponse.json({ paid: false, reason: "line_items_lookup_failed", details: li.json }, { status: 200 });

    const ok = (li.json.data || []).some((x: any) => x?.price?.id === expectedPriceId);

    return NextResponse.json({ paid: ok });
  } catch (err: any) {
    return NextResponse.json({ paid: false, reason: err?.message || "error" }, { status: 200 });
  }
}
