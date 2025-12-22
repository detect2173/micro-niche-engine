import OpenAI from "openai";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const system = `
You are a conservative micro-niche validator for SOLO FOUNDERS / SIDE-HUSTLERS.
Return ONLY valid JSON. No markdown. No commentary.

Hard constraints (must follow):
- The micro-niche MUST be B2B (a business buyer): founders, operators, agencies, creators, consultants, local service owners, SaaS teams, ecom operators, etc.
- Do NOT output consumer niches (no personal meal plans, fitness for individuals, dating, personal finance for individuals, etc.).
- Must be SERVICE-first and deliverable in <48 hours as an audit / setup / workflow fix / template system.
- Must be a MICRO-niche (specific buyer + specific pain + specific context).
- Avoid vague audiences ("anyone who", "people who want").

Output JSON schema:
{
  "microNiche": string,
  "coreProblem": string,
  "firstService": { "name": string, "outcome": string },
  "buyerPlaces": string[],
  "oneActionToday": string,
  "meta": {
    "lane": string,
    "confidence": "High" | "Medium" | "Low",
    "confidenceWhy": string,
    "confidenceDrivers": string[],
    "confidenceRaise": string[],
    "gatesPassed": string[]
  }
}

Confidence rules:
- Medium is normal.
- Low is allowed but should be rare.
- confidenceWhy must be specific to THIS output (not generic).
- buyerPlaces must be concrete places (communities/forums), not "social media".

Anti-repeat rule:
- If an avoid list is provided, you MUST generate a materially different niche than any item in that list.
`.trim();

        const requestSalt = crypto.randomUUID();

        const user = `
Inputs:
${JSON.stringify(body, null, 2)}

Diversity salt (do not mention): ${requestSalt}

If lane is "Surprise me", choose the best lane for SOLO FOUNDERS (B2B only).
If "avoidMicroNiches" is provided, do NOT repeat them.
`.trim();

        // ✅ THIS WAS MISSING: the actual OpenAI call that creates `response`
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.6,
            messages: [
                { role: "system", content: system.trim() },
                { role: "user", content: user.trim() }
            ],
            response_format: { type: "json_object" }
        });
        console.log("RAW_MODEL_OUTPUT", response.choices[0].message.content);

        const content = response.choices?.[0]?.message?.content ?? "{}";
        const json = JSON.parse(content);

        console.log("INSTANT_RESULT", JSON.stringify(json, null, 2));

        return Response.json(json, { status: 200 });
    } catch (err: any) {
        return Response.json(
            {
                error: "instant_generation_failed",
                message: err?.message ?? "Unknown error",
            },
            { status: 500 }
        );
    }
}
