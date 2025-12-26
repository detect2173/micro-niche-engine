import { NextRequest, NextResponse } from "next/server";
import { verifyDeepProofPass } from "@/app/api/stripe/pass";

export const runtime = "nodejs";

type Confidence = "High" | "Medium" | "Low";

type InstantProof = {
  microNiche: string;
  coreProblem: string;
  firstService: { name: string; outcome: string };
  buyerPlaces: string[];
  oneActionToday: string;
  meta?: {
    lane: string;
    confidence: Confidence;
    confidenceWhy?: string;
    confidenceDrivers?: string[];
    confidenceRaise?: string[];
    gatesPassed: string[];
  };
};

type DeepProof = {
  whyExists: string;
  proofSignals: string[];
  underserved: string;
  stability: string;
  executionPath: string[];
  expansionLater: string[];
  riskCheck: { risk: string; mitigation: string }[];
  meta?: {
    passExpiresAt: number;
    secondsRemaining: number;
    passHours: number;
  };
};

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

  if (!res.ok) return { ok: false, status: res.status, json };
  return { ok: true, status: res.status, json };
}

const PASS_DURATION_HOURS = 24;

async function verifyPaidAndGetPass(sessionId: string) {
  const expectedPriceId = mustEnv("STRIPE_PRICE_DEEP_PROOF");

  // 1) Session lookup
  const sess = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!sess.ok) return { ok: false as const, reason: "session_lookup_failed", details: sess.json };

  const paymentStatus = sess.json?.payment_status;
  if (paymentStatus !== "paid") {
    return { ok: false as const, reason: "not_paid", payment_status: paymentStatus ?? "unknown" };
  }

  // 2) Line items lookup
  const li = await stripeGet(
      `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=10`
  );
  if (!li.ok) return { ok: false as const, reason: "line_items_lookup_failed", details: li.json };

  const matches = (li.json?.data || []).some((x: any) => x?.price?.id === expectedPriceId);
  if (!matches) return { ok: false as const, reason: "wrong_price" };

  // 3) Pass window (24h from session created)
  const createdSec = Number(sess.json?.created ?? 0);
  if (!createdSec) {
    // Shouldn't happen, but don't explode.
    return {
      ok: true as const,
      passExpiresAt: Date.now() + PASS_DURATION_HOURS * 60 * 60 * 1000,
      secondsRemaining: PASS_DURATION_HOURS * 60 * 60,
      passHours: PASS_DURATION_HOURS,
    };
  }

  const passExpiresAt = createdSec * 1000 + PASS_DURATION_HOURS * 60 * 60 * 1000;
  const secondsRemaining = Math.floor((passExpiresAt - Date.now()) / 1000);

  if (secondsRemaining <= 0) {
    return { ok: false as const, reason: "expired", passExpiresAt, secondsRemaining };
  }

  return {
    ok: true as const,
    passExpiresAt,
    secondsRemaining,
    passHours: PASS_DURATION_HOURS,
  };
}

async function openaiDeepProof(instant: InstantProof, notes?: string) {
  const apiKey = mustEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL_DEEP || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `You are the Micro-Niche Engine. Return ONLY valid JSON matching this schema:
{
  "whyExists": string,
  "proofSignals": string[],
  "underserved": string,
  "stability": string,
  "executionPath": string[],
  "expansionLater": string[],
  "riskCheck": [{"risk": string, "mitigation": string}]
}

Rules:
- Be conservative. No hype. No made-up facts.
- Proof signals should be things a user could realistically observe (complaints, DIY workarounds, job posts, forums, tool stacks, etc.).
- Execution path must be a 7–14 day sequence.
- Risks must be real, with practical mitigations.
`;

  const user = { instant, notes: notes || "" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "OpenAI request failed");

  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  return JSON.parse(content) as Omit<DeepProof, "meta">;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = body?.sessionId as string | undefined;
    const instant = body?.instant as InstantProof | undefined;
    const notes = body?.notes as string | undefined;

    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    if (!instant) return NextResponse.json({ error: "Missing instant" }, { status: 400 });

    const pass = await verifyPaidAndGetPass(sessionId);
    if (!pass.ok) {
      return NextResponse.json(
          { error: "Payment required", reason: pass.reason },
          { status: 402 }
      );
    }

    const deep = await openaiDeepProof(instant, notes);

    const out: DeepProof = {
      ...deep,
      meta: {
        passExpiresAt: pass.passExpiresAt,
        secondsRemaining: pass.secondsRemaining,
        passHours: pass.passHours,
      },
    };

    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
