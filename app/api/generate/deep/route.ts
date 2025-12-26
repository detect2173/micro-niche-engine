// app/api/generate/deep/route.ts
import { NextResponse } from "next/server";
import { verifyDeepProofPass } from "@/app/api/stripe/pass";

export const runtime = "nodejs";

/** -----------------------------
 * Types (match frontend DeepProof)
 * ----------------------------- */

type DeepProof = {
    verdict?: "BUILD" | "TEST" | "AVOID";
    why?: {
        summary?: string;
        signals?: string[];
        underserved?: string;
        stability?: string;
    };
    money?: {
        typicalPriceRange?: string;
        clientsFor1k?: string;
        realism30to60Days?: string;
    };
    testPlan?: {
        goal?: string;
        method?: string;
        successSignal?: string;
        failureSignal?: string;
        timeCap?: string;
    };
    firstMove?: {
        type?: string;
        title?: string;
        content?: string;
    };
    killSwitch?: string[];
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

/** -----------------------------
 * Narrow parsing helpers
 * ----------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function getString(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
}

function getStringArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function getInstant(v: unknown): InstantProof | null {
    if (!isRecord(v)) return null;

    const microNiche = getString(v.microNiche);
    const coreProblem = getString(v.coreProblem);
    const oneActionToday = getString(v.oneActionToday);

    const firstServiceRaw = v.firstService;
    const firstService =
        isRecord(firstServiceRaw) &&
        typeof firstServiceRaw.name === "string" &&
        typeof firstServiceRaw.outcome === "string"
            ? { name: firstServiceRaw.name, outcome: firstServiceRaw.outcome }
            : null;

    const buyerPlaces = getStringArray(v.buyerPlaces);

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

function firstNonEmpty(arr?: string[]): string {
    return (arr ?? []).map((x) => x.trim()).find(Boolean) ?? "";
}

/** -----------------------------
 * Route
 * ----------------------------- */

export async function POST(req: Request) {
    const body: unknown = await req.json().catch(() => null);

    if (!isRecord(body)) {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const sessionId = (getString(body.sessionId) ?? "").trim();
    const instant = getInstant(body.instant);
    const notes = (getString(body.notes) ?? "").trim();

    if (!instant) {
        return NextResponse.json({ error: "Missing/invalid instant payload." }, { status: 400 });
    }

    // Enforce paywall
    const pass = await verifyDeepProofPass(sessionId);
    if (!pass.ok) {
        return NextResponse.json({ error: pass.reason ?? "Locked or expired." }, { status: 402 });
    }

    const niche = instant.microNiche.trim();
    const problem = instant.coreProblem.trim();
    const svc = instant.firstService.name.trim();
    const outcome = instant.firstService.outcome.trim();
    const place = firstNonEmpty(instant.buyerPlaces);

    /**
     * Decide verdict (simple + honest heuristic)
     * You can evolve this later with real signal scoring.
     */
    const verdict: DeepProof["verdict"] =
        niche.length > 12 && problem.length > 12 && svc.length > 6 ? "TEST" : "AVOID";

    const whySummary =
        verdict === "AVOID"
            ? `This idea is too under-specified to invest time/money confidently. Tighten the niche or clarify the first offer.`
            : `The pain (“${problem}”) is common enough to test quickly, and the offer (“${svc}”) is simple to prototype. The only real unknown is buyer access and willingness to pay.`;

    const dp: DeepProof = {
        verdict,

        why: {
            summary: notes ? `${whySummary} Notes considered: ${notes}` : whySummary,
            signals: [
                "Reviews mentioning slow response times, missed calls, or follow-ups slipping",
                "Job postings for admin/CSR support (proxy for recurring workflow load)",
                "Public posts asking for recommendations (active demand signal)",
                "Existing competitors selling partial solutions (buyers already spend money here)",
            ],
            underserved:
                "Most solutions are either too generic (one-size-fits-all) or require heavy setup. A tight, outcome-driven first offer can win quickly.",
            stability:
                "Operational and communication problems don’t disappear with trends. As long as customers expect fast responses, this remains a durable pain (2–5 years).",
        },

        money: {
            typicalPriceRange: "$300–$1,200 for setup (optional $49–$199/mo support/optimization)",
            clientsFor1k: "1–3 clients (depending on your price + whether you include a monthly support component)",
            realism30to60Days:
                "Realistic if you contact ~30–60 prospects and can get 10–15 short conversations. If you avoid outreach entirely, timeline becomes uncertain.",
        },

        testPlan: {
            goal: "Validate willingness-to-pay without building anything heavy.",
            method:
                "Pick one buyer channel, run a 10–15 message outreach sprint, and sell a paid pilot before building full implementation.",
            successSignal:
                "2–3 prospects say ‘yes’ to a short call AND at least 1 agrees to a paid pilot at your stated price.",
            failureSignal:
                "After ~30 contacts you can’t get 5 real conversations OR everyone price-pushes to free.",
            timeCap: "14 days max for validation. If it doesn’t move, pivot the channel or niche.",
        },

        firstMove: {
            type: "Outreach Script + Search Query",
            title: "Your first real move (copy/paste)",
            content:
                `ONE-LINER OFFER:\n` +
                `I help ${niche} solve ${problem.toLowerCase()} with ${svc} so they get ${outcome.toLowerCase()}.\n\n` +
                `SEARCH QUERY (find pain in the wild):\n` +
                (place
                    ? `${place} + "${niche}" + ( "missed calls" OR "no response" OR "never called back" )`
                    : `"${niche}" ( "missed calls" OR "no response" OR "never called back" )`) +
                `\n\n` +
                `OUTREACH DM:\n` +
                `Quick question — are you currently handling ${problem.toLowerCase()} manually, or do you have a system?\n\n` +
                `If it’s manual, I can set up ${svc} so you get ${outcome.toLowerCase()}.\n` +
                `Worth a 10-minute look, or should I leave you alone forever?`,
        },

        killSwitch: [
            "If you can’t get 5 real conversations after contacting ~30 prospects, pause and change the buyer channel or niche.",
            "If buyers only want it free/‘done yesterday’, stop — price sensitivity is too high for a simple solo offer.",
            "If delivery requires heavy customization for every client, stop and productize the offer before scaling outreach.",
        ],

        meta: {
            passExpiresAt: pass.passExpiresAt,
            secondsRemaining: pass.secondsRemaining,
            passHours: Number(process.env.DEEP_PASS_HOURS ?? 24) || 24,
        },
    };

    return NextResponse.json(dp);
}
