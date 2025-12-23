// app/api/generate/instant/route.ts
export const runtime = "edge";

type InstantRequest = {
    lane?: string;
    notes?: string;
    level?: "standard" | "strict";
    avoidMicroNiches?: string[];
};

function json(data: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        ...init,
    });
}

function stripCodeFences(s: string) {
    return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeJsonParse(s: string) {
    try {
        return JSON.parse(stripCodeFences(s));
    } catch {
        return null;
    }
}

export async function POST(req: Request) {
    try {
        const body = (await req.json().catch(() => ({}))) as InstantRequest;

        const lane = (body.lane ?? "").toString().trim();
        const notes = (body.notes ?? "").toString().trim();
        const level = (body.level ?? "standard") as "standard" | "strict";
        const avoidMicroNiches = Array.isArray(body.avoidMicroNiches) ? body.avoidMicroNiches : [];

        if (!process.env.OPENAI_API_KEY) {
            return json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
        }

        // Keep this tight so “Instant” feels instant.
        const system = `You are Micro-Niche Engine (Instant Mode).
Return ONLY valid JSON. No markdown. No commentary.
Goal: generate fast, high-quality micro-niche angles that are practical and monetizable.
Avoid generic niches and avoid anything listed in avoidMicroNiches.`;

        const user = {
            lane,
            notes,
            level,
            avoidMicroNiches,
            output: {
                ideas: "8-12 micro-niche ideas. Each with: name, who, pain, offer, channel, why_now, difficulty(1-5).",
                top3: "Pick best 3 from ideas with short rationale and a first-step action.",
            },
        };

        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.6,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: JSON.stringify(user) },
                ],
            }),
        });

        if (!r.ok) {
            const errText = await r.text().catch(() => "");
            return json(
                { ok: false, error: "OpenAI request failed", status: r.status, detail: errText.slice(0, 500) },
                { status: 500 }
            );
        }

        const data = await r.json();
        const content = data?.choices?.[0]?.message?.content ?? "";
        const parsed = safeJsonParse(content);

        if (!parsed) {
            return json(
                { ok: false, error: "Model did not return valid JSON", raw: content.slice(0, 1000) },
                { status: 500 }
            );
        }

        return json({ ok: true, ...parsed });
    } catch (e: any) {
        return json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
    }
}
