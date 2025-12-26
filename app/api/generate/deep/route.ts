// app/api/generate/deep/route.ts
import { NextResponse } from "next/server";
import { verifyDeepProofPass } from "@/app/api/stripe/pass";

export const runtime = "nodejs";

type DeepProof = {
    verdict: "BUILD" | "TEST" | "AVOID";
    why: string;
    proofSignals: string[];
    realisticallyPays: {
        typicalPriceRange: string;
        clientsFor1kMo: string;
        realismIn30to60Days: string;
    };
    safeTestPlan: string[];
    firstRealMoveArtifact: {
        outreachScript: string;
        searchQuery: string;
        offerOneLiner: string;
    };
    killSwitch: string[];
    meta?: {
        passExpiresAt?: number; // ms epoch
        secondsRemaining?: number;
        passHours?: number;
    };
};

type InstantProof = {
    microNiche: string;
    coreProblem: string;
    firstService: { name: string; outcome: string };
    buyerPlaces: string[];
    oneActionToday: string;
    meta?: { lane?: string };
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function getString(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
}
function getInstant(v: unknown): InstantProof | null {
    if (!isRecord(v)) return null;

    const microNiche = getString(v.microNiche);
    const coreProblem = getString(v.coreProblem);
    const oneActionToday = getString(v.oneActionToday);

    const firstServiceRaw = (v.firstService ?? null);
    const firstService =
        isRecord(firstServiceRaw) && typeof firstServiceRaw.name === "string" && typeof firstServiceRaw.outcome === "string"
            ? { name: firstServiceRaw.name, outcome: firstServiceRaw.outcome }
            : null;

    const buyerPlaces = Array.isArray(v.buyerPlaces)
        ? v.buyerPlaces.filter((x): x is string => typeof x === "string")
        : [];

    if (!microNiche || !coreProblem || !firstService) return null;

    return {
        microNiche,
        coreProblem,
        firstService,
        buyerPlaces,
        oneActionToday: oneActionToday ?? "",
        meta: isRecord(v.meta) && typeof v.meta.lane === "string" ? { lane: v.meta.lane } : undefined,
    };
}

export async function POST(req: Request) {
    const body: unknown = await req.json().catch(() => null);

    if (!isRecord(body)) {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const sessionId = getString(body.sessionId) ?? "";
    const instant = getInstant(body.instant);
    const notes = getString(body.notes) ?? "";

    if (!instant) {
        return NextResponse.json({ error: "Missing/invalid instant payload." }, { status: 400 });
    }

    // ✅ Use the function (fixes unused warning) + enforce paywall
    const pass = await verifyDeepProofPass(sessionId);
    if (!pass.ok) {
        return NextResponse.json({ error: pass.reason ?? "Locked or expired." }, { status: 402 });
    }

    const niche = instant.microNiche.trim();
    const problem = instant.coreProblem.trim();
    const svc = instant.firstService.name.trim();
    const outcome = instant.firstService.outcome.trim();

    // Paid output spec: decisional, not informational
    const dp: DeepProof = {
        verdict: "TEST",
        why:
            `This is a real, common pain (${problem}) and the first offer is simple (${svc}). ` +
            `The main unknown is how quickly you can reach buyers and confirm willingness to pay. ` +
            (notes ? `Notes considered: ${notes}` : ""),
        proofSignals: [
            "Businesses mentioning slow responses / missed calls in reviews",
            "Job postings for admin/CSR support (proxy for workflow load)",
            "Public posts asking for recommendations (shows active demand)",
            "Competitors offering partial solutions (means money is being spent)",
        ],
        realisticallyPays: {
            typicalPriceRange: "$300–$1,200 for setup (plus optional $49–$199/mo for support/optimization)",
            clientsFor1kMo: "1–3 clients (depending on pricing and whether you include monthly support)",
            realismIn30to60Days:
                "Realistic if you can contact 30–60 prospects and run 10–15 short conversations. If you avoid outreach entirely, timeline becomes uncertain.",
        },
        safeTestPlan: [
            "Pick ONE buyer channel from the list and contact 10 prospects (no building yet).",
            "Ask one diagnostic question and offer a 15-minute call if they say yes.",
            "If you get 2–3 ‘yes’ signals, build a tiny proof stub (mock flow + screenshot).",
            "Offer a paid pilot at a clear price with a clear outcome and timeline.",
            "Stop after 14 days if you can’t get conversations (that’s the real bottleneck).",
        ],
        firstRealMoveArtifact: {
            offerOneLiner: `I help ${niche} solve ${problem.toLowerCase()} with ${svc} so they get ${outcome.toLowerCase()}.`,
            searchQuery: `"${niche}" "missed calls" OR "no response" OR "never called back"`,
            outreachScript:
                `Quick question — are you currently handling ${problem.toLowerCase()} manually, or do you have a system?\n\n` +
                `If it’s manual, I can set up ${svc} so you get ${outcome.toLowerCase()}. ` +
                `Worth a 10-minute look, or should I leave you alone forever?`,
        },
        killSwitch: [
            "If you can’t get 5 real conversations after contacting 30 prospects, pause and change the buyer channel or niche.",
            "If buyers insist they only want ‘done yesterday for free’, stop — price sensitivity is too high.",
            "If delivery requires heavy customization per client, stop and productize the offer before continuing.",
        ],
        meta: {
            passExpiresAt: pass.passExpiresAt,
            secondsRemaining: pass.secondsRemaining,
            passHours: Number(process.env.DEEP_PASS_HOURS ?? 24) || 24,
        },
    };

    return NextResponse.json(dp);
}
