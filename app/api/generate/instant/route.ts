// app/api/generate/instant/route.ts
export const runtime = "nodejs";

import OpenAI from "openai";
import crypto from "crypto";

type InstantRequest = {
    lane?: string;
    notes?: string;
    level?: "standard" | "strict";
    avoidMicroNiches?: string[];
};

type InstantProof = {
    microNiche: string;
    coreProblem: string;
    firstService: { name: string; outcome: string };
    buyerPlaces: string[];
    oneActionToday: string;
    meta: {
        lane: string;
        confidence: "High" | "Medium" | "Low";
        confidenceWhy: string;
        confidenceDrivers: string[];
        confidenceRaise: string[];
        gatesPassed: string[];
    };
};

function json(data: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        ...init,
    });
}

function stripCodeFences(s: unknown): string {
    const text = typeof s === "string" ? s : String(s ?? "");
    return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

function safeJsonParse(s: unknown): any {
    try {
        const cleaned = stripCodeFences(s);
        return cleaned ? JSON.parse(cleaned) : null;
    } catch {
        return null;
    }
}

function normalizeInstantProof(x: any, fallbackLane: string): InstantProof | null {
    if (!x || typeof x !== "object") return null;

    // Accept some drift but normalize to our UI contract.
    const microNiche = String(
        x?.microNiche ?? x?.micro_niche ?? x?.name ?? ""
    ).trim();

    if (!microNiche) return null;

    const coreProblem = String(x?.coreProblem ?? x?.pain ?? "").trim();

    const firstServiceName = String(x?.firstService?.name ?? x?.offer ?? "Service").trim();
    const firstServiceOutcome = String(x?.firstService?.outcome ?? x?.outcome ?? "").trim();

    const buyerPlacesRaw = x?.buyerPlaces ?? x?.buyer_places ?? x?.channel;
    const buyerPlaces =
        Array.isArray(buyerPlacesRaw)
            ? buyerPlacesRaw.map((v: any) => String(v ?? "").trim()).filter(Boolean)
            : [String(buyerPlacesRaw ?? "").trim()].filter(Boolean);

    const oneActionToday = String(
        x?.oneActionToday ?? x?.one_action_today ?? x?.first_step ?? ""
    ).trim();

    const metaLane = String(x?.meta?.lane ?? x?.lane ?? fallbackLane ?? "General").trim() || "General";

    const confidence = ((): "High" | "Medium" | "Low" => {
        const c = String(x?.meta?.confidence ?? x?.confidence ?? "Medium").trim();
        if (c === "High" || c === "Medium" || c === "Low") return c;
        return "Medium";
    })();

    const confidenceWhy = String(x?.meta?.confidenceWhy ?? x?.confidenceWhy ?? "").trim();

    const confidenceDrivers = Array.isArray(x?.meta?.confidenceDrivers)
        ? x.meta.confidenceDrivers.map((v: any) => String(v ?? "").trim()).filter(Boolean)
        : [];

    const confidenceRaise = Array.isArray(x?.meta?.confidenceRaise)
        ? x.meta.confidenceRaise.map((v: any) => String(v ?? "").trim()).filter(Boolean)
        : [];

    const gatesPassed = Array.isArray(x?.meta?.gatesPassed)
        ? x.meta.gatesPassed.map((v: any) => String(v ?? "").trim()).filter(Boolean)
        : [];

    return {
        microNiche,
        coreProblem,
        firstService: { name: firstServiceName, outcome: firstServiceOutcome },
        buyerPlaces,
        oneActionToday,
        meta: {
            lane: metaLane,
            confidence,
            confidenceWhy: confidenceWhy || "Confidence explanation not provided.",
            confidenceDrivers,
            confidenceRaise,
            gatesPassed,
        },
    };
}

export async function POST(req: Request) {
    try {
        const body = (await req.json().catch(() => ({}))) as InstantRequest;

        const lane = String(body.lane ?? "").trim();
        const notes = String(body.notes ?? "").trim();
        const level = (body.level ?? "standard") as "standard" | "strict";
        const avoidMicroNiches = Array.isArray(body.avoidMicroNiches) ? body.avoidMicroNiches : [];

        if (!process.env.OPENAI_API_KEY) {
            return json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
        }

        const requestSalt = crypto.randomUUID();

        const system = `You are a conservative micro-niche validator for SOLO FOUNDERS / SIDE-HUSTLERS.
Return ONLY valid JSON. No markdown. No commentary.

Hard constraints (must follow):
- The micro-niche MUST be B2B (a business buyer)
- Do NOT output consumer niches
- Must be SERVICE-first and deliverable in <48 hours
- Must be a MICRO-niche
- Avoid vague audiences

Output JSON schema:
{
  microNiche: string,
  coreProblem: string,
  firstService: { name: string, outcome: string },
  buyerPlaces: string[],
  oneActionToday: string,
  meta: {
    lane: string,
    confidence: "High" | "Medium" | "Low",
    confidenceWhy: string,
    confidenceDrivers: string[],
    confidenceRaise: string[],
    gatesPassed: string[]
  }
}

Confidence rules:
- Medium is normal
- Low is allowed but rare
- confidenceWhy must be specific
- buyerPlaces must be concrete

Anti-repeat rule:
- If an avoid list is provided, generate a materially different niche`;

        const user = {
            lane,
            notes,
            level,
            avoidMicroNiches,
            requestSalt,
        };

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.6,
            messages: [
                { role: "system", content: system },
                { role: "user", content: JSON.stringify(user) },
            ],
        });

        const content = completion?.choices?.[0]?.message?.content ?? "";
        const parsed = safeJsonParse(content);

        const normalized = normalizeInstantProof(parsed, lane);

        if (!normalized) {
            return json(
                { ok: false, error: "Model did not return valid InstantProof JSON", raw: String(content).slice(0, 1200) },
                { status: 500 }
            );
        }

        return json({ ok: true, ...normalized });
    } catch (e: any) {
        return json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
    }
}
