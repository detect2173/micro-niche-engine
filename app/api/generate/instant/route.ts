// app/api/generate/instant/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Confidence = "High" | "Medium" | "Low";

type InstantProof = {
    microNiche: string;
    coreProblem: string;
    firstService: { name: string; outcome: string };
    buyerPlaces: string[];
    oneActionToday: string;
    meta?: {
        lane?: string;
        confidence?: Confidence;
        confidenceWhy?: string;
        confidenceDrivers?: string[];
        confidenceRaise?: string[];
        gatesPassed?: string[];
        generatedAt?: number;
    };
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function getString(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
}
function getStringArray(v: unknown): string[] | undefined {
    if (!Array.isArray(v)) return undefined;
    const out = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
    return out.length ? out : undefined;
}

export async function POST(req: Request) {
    const body: unknown = await req.json().catch(() => null);

    if (!isRecord(body)) {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const lane = getString(body.lane) ?? "Surprise me";
    const laneId = getString(body.laneId) ?? "surprise";
    const timeId = getString(body.timeId) ?? "5-10";
    const levelId = getString(body.levelId) ?? "beginner";
    const notes = getString(body.notes) ?? "";
    const avoidMicroNiches = getStringArray(body.avoidMicroNiches) ?? [];

    // NOTE:
    // If you already call OpenAI here in your original version, reinsert that logic.
    // This stub is lint-clean and deterministic enough to keep UI working.
    const seed = `${laneId}|${timeId}|${levelId}|${notes}|${avoidMicroNiches.join(",")}`.toLowerCase();

    const result: InstantProof = {
        microNiche: seed.includes("local")
            ? "Local HVAC companies that struggle with missed calls after hours"
            : "Solo service providers who need faster lead qualification without ads",
        coreProblem: "Leads fall through because inquiries aren’t captured and qualified consistently.",
        firstService: {
            name: "Lead-capture + qualification chatbot setup",
            outcome: "Fewer missed leads and more booked calls without extra staff time",
        },
        buyerPlaces: [
            "Facebook groups for small business owners",
            "Google Maps listings (contact businesses directly)",
            "Local chamber of commerce directories",
        ],
        oneActionToday: "Make a list of 10 prospects and send 5 short DMs asking how they handle missed inquiries.",
        meta: {
            lane,
            confidence: "Medium",
            confidenceWhy: "Buyer exists, pain is common, and implementation is straightforward; proof signals not yet verified.",
            confidenceDrivers: ["Clear buyer type", "Frequent operational pain", "Simple first offer"],
            confidenceRaise: ["Find 3 proof signals (posts/reviews) showing missed leads", "Validate pricing willingness with 5 conversations"],
            gatesPassed: ["Buyer clarity", "Pain clarity", "First offer clarity"],
            generatedAt: Date.now(),
        },
    };

    return NextResponse.json(result);
}
