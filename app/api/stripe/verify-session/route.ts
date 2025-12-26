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
    headers: { Authorization: `Bearer ${key}` },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) return { ok: false as const, status: res.status, json };
  return { ok: true as const, status: res.status, json };
}

const PASS_DURATION_HOURS = 24;

type VerifyResponse = {
  paid: boolean;
  reason?: string;
  payment_status?: string;

  passExpiresAt: number | null;     // epoch ms
  secondsRemaining: number | null;

  passExpiresAtIso?: string | null; // optional helper
  passHours: number;
};

function okResponse(payload: VerifyResponse) {
  return NextResponse.json(payload, { status: 200 });
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return okResponse({
        paid: false,
        reason: "missing_session_id",
        passExpiresAt: null,
        secondsRemaining: null,
        passExpiresAtIso: null,
        passHours: PASS_DURATION_HOURS,
      });
    }

    const expectedPriceId = mustEnv("STRIPE_PRICE_DEEP_PROOF");
    const sid = encodeURIComponent(sessionId);

    // 1) Lookup session
    const sess = await stripeGet(`/v1/checkout/sessions/${sid}`);
    if (!sess.ok) {
      return okResponse({
        paid: false,
        reason: "session_lookup_failed",
        passExpiresAt: null,
        secondsRemaining: null,
        passExpiresAtIso: null,
        passHours: PASS_DURATION_HOURS,
      });
    }

    const paymentStatus = sess.json?.payment_status ?? "unknown";
    if (paymentStatus !== "paid") {
      return okResponse({
        paid: false,
        reason: "not_paid",
        payment_status: paymentStatus,
        passExpiresAt: null,
        secondsRemaining: null,
        passExpiresAtIso: null,
        passHours: PASS_DURATION_HOURS,
      });
    }

    // 2) Validate line item price matches what we expect
    const li = await stripeGet(`/v1/checkout/sessions/${sid}/line_items?limit=10`);
    if (!li.ok) {
      return okResponse({
        paid: false,
        reason: "line_items_lookup_failed",
        passExpiresAt: null,
        secondsRemaining: null,
        passExpiresAtIso: null,
        passHours: PASS_DURATION_HOURS,
      });
    }

    const matchesPrice = (li.json?.data || []).some(
        (x: any) => x?.price?.id === expectedPriceId
    );

    if (!matchesPrice) {
      return okResponse({
        paid: false,
        reason: "wrong_price",
        passExpiresAt: null,
        secondsRemaining: null,
        passExpiresAtIso: null,
        passHours: PASS_DURATION_HOURS,
      });
    }

    // 3) Compute pass expiry (24h from session creation)
    const createdSec = Number(sess.json?.created ?? 0);
    if (!createdSec) {
      // Can't compute expiry -> treat as not verifiable/unlocked
      return okResponse({
        paid: false,
        reason: "missing_created_timestamp",
        passExpiresAt: null,
        secondsRemaining: null,
        passExpiresAtIso: null,
        passHours: PASS_DURATION_HOURS,
      });
    }

    const passExpiresAt =
        createdSec * 1000 + PASS_DURATION_HOURS * 60 * 60 * 1000;

    const secondsRemaining = Math.max(
        0,
        Math.floor((passExpiresAt - Date.now()) / 1000)
    );

    if (secondsRemaining <= 0) {
      return okResponse({
        paid: false,
        reason: "expired",
        passExpiresAt,
        secondsRemaining,
        passExpiresAtIso: new Date(passExpiresAt).toISOString(),
        passHours: PASS_DURATION_HOURS,
      });
    }

    return okResponse({
      paid: true,
      passExpiresAt,
      secondsRemaining,
      passExpiresAtIso: new Date(passExpiresAt).toISOString(),
      passHours: PASS_DURATION_HOURS,
    });
  } catch (err: any) {
    return okResponse({
      paid: false,
      reason: err?.message || "error",
      passExpiresAt: null,
      secondsRemaining: null,
      passExpiresAtIso: null,
      passHours: PASS_DURATION_HOURS,
    });
  }
}
