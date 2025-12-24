import { NextRequest, NextResponse } from "next/server";

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

async function verifyPaid(sessionId: string) {
  const expectedPriceId = mustEnv("STRIPE_PRICE_DEEP_PROOF");

  const sess = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!sess.ok) return { ok: false, reason: "session_lookup_failed", details: sess.json };

  if (sess.json.payment_status !== "paid") {
    return { ok: false, reason: "not_paid", payment_status: sess.json.payment_status };
  }

  const li = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=10`);
  if (!li.ok) return { ok: false, reason: "line_items_lookup_failed", details: li.json };

  const matches = (li.json.data || []).some((x: any) => x?.price?.id === expectedPriceId);
  if (!matches) return { ok: false, reason: "wrong_price" };

  return { ok: true };
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
  "riskCheck": [{"risk": string, "mitigation": string}[]]
}

Rules:
- Be conservative. No hype. No made-up facts.
- Proof signals should be things a user could realistically observe (complaints, DIY workarounds, job posts, forums, tool stacks, etc.).
- Execution path must be a 7–14 day sequence.
- Risks must be real, with practical mitigations.
`;

  const user = {
    instant,
    notes: notes || "",
  };

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
  if (!res.ok) {
    throw new Error(json?.error?.message || "OpenAI request failed");
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  // content is JSON string because we forced json_object
  return JSON.parse(content);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = body?.sessionId as string | undefined;
    const instant = body?.instant as InstantProof | undefined;
    const notes = body?.notes as string | undefined;

    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    if (!instant) return NextResponse.json({ error: "Missing instant" }, { status: 400 });

    const paid = await verifyPaid(sessionId);
    if (!paid.ok) {
      return NextResponse.json({ error: "Payment required", reason: paid.reason }, { status: 402 });
    }

    const deep = await openaiDeepProof(instant, notes);
    return NextResponse.json(deep);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
