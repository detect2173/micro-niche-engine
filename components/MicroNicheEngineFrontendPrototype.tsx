"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    ChevronRight,
    Sparkles,
    ShieldCheck,
    Lock,
    Unlock,
    Wand2,
    Star,
    StarOff,
    History,
    RotateCcw,
    Trash2,
    Loader2,
    Download,
} from "lucide-react";
import QuickStart15 from "@/components/QuickStart15";

/** -----------------------------
 *  Types
 *  ----------------------------- */

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

type DeepProof = {
    verdict?: "BUILD" | "TEST" | "AVOID";

    // 2) Why (supporting signals, concise)
    why?: {
        summary?: string;
        signals?: string[];
        underserved?: string;
        stability?: string;
    };

    // 3) Money anchor
    money?: {
        typicalPriceRange?: string;
        clientsFor1k?: string;
        realism30to60Days?: string;
    };

    // 4) How to test safely (bounded)
    testPlan?: {
        goal?: string;
        method?: string;
        successSignal?: string;
        failureSignal?: string;
        timeCap?: string;
    };

    // 5) Your first real move (artifact)
    firstMove?: {
        type?: string;
        title?: string;
        content?: string;
    };

    // 6) Kill switch (when to stop)
    killSwitch?: string[];

    meta?: {
        passExpiresAt?: number; // ms epoch
        secondsRemaining?: number;
        passHours?: number;
    };
};

type VerifyResponse = {
    paid?: boolean;
    passExpiresAt?: number;
    secondsRemaining?: number;
};

/** -----------------------------
 *  Config + constants
 *  ----------------------------- */

const lanes = [
    { id: "surprise", label: "Surprise me" },
    { id: "online", label: "Online business" },
    { id: "local", label: "Local services" },
    { id: "ops", label: "Ops / admin workflows" },
    { id: "marketing", label: "Marketing / sales workflows" },
    { id: "education", label: "Education / training" },
];

const timeOptions = [
    { id: "2-5", label: "2–5 hrs/week" },
    { id: "5-10", label: "5–10 hrs/week" },
    { id: "10+", label: "10+ hrs/week" },
];

const levelOptions = [
    { id: "beginner", label: "Beginner" },
    { id: "intermediate", label: "Intermediate" },
];

const LS_SESSION_KEY = "mne_session_id";
const LS_HISTORY_KEY = "mne_history_v1";
const LS_SAVED_KEY = "mne_saved_v1";

// If true, "Clear" wipes history/saved too.
// If false, "Clear" only clears the currently displayed result.
const CLEAR_WIPES_LISTS = false;

/** -----------------------------
 *  Helpers
 *  ----------------------------- */

async function safeReadJson(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return x !== null && typeof x === "object";
}

function getApiErrorMessage(payload: unknown): string | null {
    if (payload === null || typeof payload !== "object") return null;

    const p = payload as Record<string, unknown>;
    const msg =
        typeof p.message === "string"
            ? p.message
            : typeof p.error === "string"
                ? p.error
                : null;

    return msg && msg.trim() ? msg : null;
}

function short(s: string, max = 88) {
    if (!s) return s;
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Stable key so we can dedupe + star across refreshes.
function keyForInstant(x: unknown) {
    const obj = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const meta = obj.meta && typeof obj.meta === "object" ? (obj.meta as Record<string, unknown>) : {};
    const lane = String(meta.lane ?? obj.lane ?? "Lane").trim();
    const micro = String(obj.microNiche ?? obj.micro_niche ?? obj.name ?? obj.micro ?? "Unknown").trim();
    return `${lane}::${micro}`;
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function formatDuration(seconds: number) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
}

function computeSecondsLeft(expiresAtMs?: number) {
    if (!expiresAtMs) return undefined;
    return Math.floor((expiresAtMs - Date.now()) / 1000);
}

function passLabel(paidUnlocked: boolean, expiresAtMs?: number, secondsRemaining?: number) {
    if (!paidUnlocked) {
        const s = typeof secondsRemaining === "number" ? secondsRemaining : computeSecondsLeft(expiresAtMs);
        if (typeof s === "number" && s <= 0 && expiresAtMs) return "Locked • expired";
        return "Locked";
    }

    // unlocked
    const s = typeof secondsRemaining === "number" ? secondsRemaining : computeSecondsLeft(expiresAtMs);
    if (typeof s === "number") {
        if (s <= 0) return "Locked • expired";
        return `Unlocked • ${formatDuration(s)} left`;
    }
    return "Unlocked";
}

function escapeHtml(s: string) {
    return (s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function listHtml(items?: string[]) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return `<div class="muted">—</div>`;
    return `<ul>${arr.map((x: string) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

function firstNonEmpty(arr?: (string | null | undefined)[] | null) {
    return (arr ?? []).map((x) => (x ?? "").trim()).find(Boolean) ?? "";
}

function buildQuickStart15Steps(x: InstantProof): string[] {
    const niche = (x.microNiche ?? "").trim();
    const problem = (x.coreProblem ?? "").trim();
    const svc = (x.firstService?.name ?? "").trim();
    const outcome = (x.firstService?.outcome ?? "").trim();
    const place = firstNonEmpty(x.buyerPlaces);

    // fallback if weak data exists
    if (!niche || !svc) {
        return [
            "Write a 1-sentence offer with a clear outcome + timeframe (e.g., “I can improve X in 7 days”).",
            "Pick one channel where buyers already hang out (FB groups, LinkedIn, directories) and collect 10 targets.",
            "Send 5 short messages today: problem → outcome → one question. Track replies in a note.",
        ];
    }

    const offer = `I help ${niche}${problem ? ` solve ${problem.toLowerCase()}` : ""} with ${svc}${
        outcome ? ` so they get ${outcome.toLowerCase()}` : ""
    }.`;

    return [
        `Write your one-liner offer: “${offer}”`,
        place
            ? `Open ${place} and make a list of 10 prospects. (Look for anyone doing this manually.)`
            : "Pick one place buyers hang out (FB group, LinkedIn search, Yelp/Google listings) and list 10 prospects.",
        `Send 5 DMs/emails today: “Quick question — are you currently handling ${problem || "this"} manually, or do you have a system?”`,
        `Create a 60-second “proof stub” (mockup, screenshot, or Loom) showing what "${svc}" looks like for ${niche}.`,
    ];
}

/** -----------------------------
 *  Component
 *  ----------------------------- */

export default function MicroNicheEngineFrontendPrototype() {
    const [mode, setMode] = useState<"instant" | "deep">("instant");

    const [laneId, setLaneId] = useState<string>("surprise");
    const [timeId, setTimeId] = useState<string>("5-10");
    const [levelId, setLevelId] = useState<string>("beginner");
    const [notes, setNotes] = useState<string>("");

    const [isGenerating, setIsGenerating] = useState(false);
    const [instant, setInstant] = useState<InstantProof | null>(null);
    const [deep, setDeep] = useState<DeepProof | null>(null);

    const [paidUnlocked, setPaidUnlocked] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [isDeepLoading, setIsDeepLoading] = useState(false);

    const [history, setHistory] = useState<InstantProof[]>([]);
    const [saved, setSaved] = useState<InstantProof[]>([]);
    const [avoidRepeats, setAvoidRepeats] = useState(true);

    const [passExpiresAt, setPassExpiresAt] = useState<number | undefined>(undefined);
    const [secondsRemaining, setSecondsRemaining] = useState<number | undefined>(undefined);

    const deepSectionRef = useRef<HTMLDivElement | null>(null);

    const userReady = useMemo(() => true, []);

    const confidenceLabel: Confidence = instant?.meta?.confidence ?? "Medium";
    const confidenceWhy =
        instant?.meta?.confidenceWhy ?? "Rating is based on buyer clarity, money proximity, and evidence strength.";
    const confidenceDrivers = instant?.meta?.confidenceDrivers ?? [];
    const confidenceRaise = instant?.meta?.confidenceRaise ?? [];

    const isSaved = useMemo(() => {
        if (!instant) return false;
        const k = keyForInstant(instant);
        return saved.some((s) => keyForInstant(s) === k);
    }, [instant, saved]);

    // Visible History = History minus Saved (prevents redundancy)
    const visibleHistory = useMemo(() => {
        if (!history.length) return [];
        if (!saved.length) return history;
        const savedKeys = new Set(saved.map((s) => keyForInstant(s)));
        return history.filter((h) => !savedKeys.has(keyForInstant(h)));
    }, [history, saved]);

    /** -----------------------------
     *  Persistence: history + saved
     *  ----------------------------- */

    useEffect(() => {
        const h = safeJsonParse<InstantProof[]>(localStorage.getItem(LS_HISTORY_KEY), []);
        const s = safeJsonParse<InstantProof[]>(localStorage.getItem(LS_SAVED_KEY), []);
        setHistory(Array.isArray(h) ? h : []);
        setSaved(Array.isArray(s) ? s : []);
    }, []);

    useEffect(() => {
        localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
    }, [history]);

    useEffect(() => {
        localStorage.setItem(LS_SAVED_KEY, JSON.stringify(saved.slice(0, 30)));
    }, [saved]);

    const addToHistory = (res: InstantProof) => {
        const k = keyForInstant(res);
        setHistory((prev) => {
            if (prev.some((x) => keyForInstant(x) === k)) return prev;
            return [res, ...prev].slice(0, 30);
        });
    };

    const toggleSave = (res: InstantProof) => {
        const k = keyForInstant(res);
        setSaved((prev) => {
            if (prev.some((x) => keyForInstant(x) === k)) {
                return prev.filter((x) => keyForInstant(x) !== k);
            }
            return [res, ...prev].slice(0, 30);
        });
    };

    const selectResult = (res: InstantProof) => {
        setInstant(res);
        setDeep(null);
        setMode("instant");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearCurrent = () => {
        setInstant(null);
        setDeep(null);
        setMode("instant");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearEverything = () => {
        clearCurrent();
        setHistory([]);
        setSaved([]);
        setAvoidRepeats(true);
    };

    /** -----------------------------
     *  Stripe session capture + verify
     *  ----------------------------- */

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");
        if (sessionId) {
            localStorage.setItem(LS_SESSION_KEY, sessionId);

            // clean URL so refresh doesn't keep session_id around
            params.delete("session_id");
            const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
            window.history.replaceState({}, "", newUrl);
        }
    }, []);

    useEffect(() => {
        const sessionId = localStorage.getItem(LS_SESSION_KEY);
        if (!sessionId) return;

        (async () => {
            try {
                const r = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`);
                const j = (await safeReadJson(r)) as VerifyResponse;

                setPaidUnlocked(!!j?.paid);

                if (typeof j?.passExpiresAt === "number") setPassExpiresAt(j.passExpiresAt);
                if (typeof j?.secondsRemaining === "number") setSecondsRemaining(j.secondsRemaining);
            } catch {
                setPaidUnlocked(false);
                setPassExpiresAt(undefined);
                setSecondsRemaining(undefined);
            }
        })();
    }, []);

    // Countdown tick if we have expiry
    useEffect(() => {
        if (!passExpiresAt) return;

        const t = setInterval(() => {
            const s = Math.floor((passExpiresAt - Date.now()) / 1000);
            setSecondsRemaining(s);
            if (s <= 0) setPaidUnlocked(false);
        }, 1000);

        return () => clearInterval(t);
    }, [passExpiresAt]);

    /** -----------------------------
     *  Actions
     *  ----------------------------- */

    const onGenerate = async () => {
        setDeep(null);
        setIsGenerating(true);

        try {
            const avoidMicroNiches = avoidRepeats ? history.map((h) => h.microNiche) : [];

            const res = await fetch("/api/generate/instant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lane: lanes.find((l) => l.id === laneId)?.label ?? "Surprise me",
                    laneId,
                    timeId,
                    levelId,
                    notes,
                    avoidMicroNiches,
                }),
            });

            if (!res.ok) {
                const err = await safeReadJson(res);
                alert(`Instant generation failed: ${getApiErrorMessage(err) ?? `Request failed: ${res.status}`}`);
                return;
            }

            const json = (await safeReadJson(res)) as InstantProof;
            setInstant(json);
            addToHistory(json);

            if (mode === "deep") {
                setTimeout(() => deepSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
            }

            const sessionId = localStorage.getItem(LS_SESSION_KEY);
            if (sessionId) {
                try {
                    const vr = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`);
                    const vj = (await safeReadJson(vr)) as VerifyResponse;
                    setPaidUnlocked(!!vj?.paid);
                    if (typeof vj?.passExpiresAt === "number") setPassExpiresAt(vj.passExpiresAt);
                    if (typeof vj?.secondsRemaining === "number") setSecondsRemaining(vj.secondsRemaining);
                } catch {
                    // leave the current state
                }
            }
        } catch (e: unknown) {
            alert(`Instant generation failed: ${getApiErrorMessage(e) ?? (e instanceof Error ? e.message : "Unknown error")}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const onUnlockDeep = async () => {
        if (!instant) return;

        setIsUnlocking(true);
        try {
            const r = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
            const j = await safeReadJson(r);

            if (!r.ok) {
                alert(`Checkout failed: ${getApiErrorMessage(j) ?? `Request failed: ${r.status}`}`);
                return;
            }

            const url = isRecord(j) && typeof j.url === "string" ? j.url : "";
            if (!url) {
                alert("Checkout failed: Checkout session creation failed.");
                return;
            }

            window.location.href = url;
        } catch (e: unknown) {
            alert(`Checkout failed: ${getApiErrorMessage(e) ?? (e instanceof Error ? e.message : "Unknown error")}`);
        } finally {
            setIsUnlocking(false);
        }
    };

    const onGenerateDeep = async () => {
        if (!instant) return;

        const sessionId = localStorage.getItem(LS_SESSION_KEY);
        if (!sessionId) {
            alert("No Stripe session found. Click Unlock Full Validation first.");
            return;
        }

        setIsDeepLoading(true);
        try {
            const r = await fetch("/api/generate/deep", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, instant, notes }),
            });

            const j = await safeReadJson(r);

            if (r.status === 402) {
                setPaidUnlocked(false);
                alert("Full Validation is locked or expired. Please unlock again.");
                return;
            }

            if (!r.ok) {
                alert(`Full Validation failed: ${getApiErrorMessage(j) ?? `Request failed: ${r.status}`}`);
                return;
            }

            const dp = j as DeepProof;
            setDeep(dp);
            setPaidUnlocked(true);

            if (typeof dp?.meta?.passExpiresAt === "number") setPassExpiresAt(dp.meta.passExpiresAt);
            if (typeof dp?.meta?.secondsRemaining === "number") setSecondsRemaining(dp.meta.secondsRemaining);

            setTimeout(() => deepSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        } catch (e: unknown) {
            alert(`Full Validation failed: ${getApiErrorMessage(e) ?? (e instanceof Error ? e.message : "Unknown error")}`);
        } finally {
            setIsDeepLoading(false);
        }
    };

    const onDownloadPdf = () => {
        if (!instant) return;

        const title = `Micro-Niche Report`;
        const subtitle = `${instant.meta?.lane ?? "Lane"} • ${new Date().toLocaleString()}`;
        const quick15 = buildQuickStart15Steps(instant);

        const paidHtml = deep
            ? `
  <div style="page-break-before: always;"></div>
  <div>
    <span class="chip">Decision-Grade Validation</span>
    <span class="chip">${escapeHtml(passLabel(true, passExpiresAt, secondsRemaining))}</span>
  </div>

  <div class="section">
    <div class="label">Verdict</div>
    <div><b>${escapeHtml(deep.verdict ?? "—")
            }</b></div>
    <div class="muted">${escapeHtml(deep.why?.summary || "—")}</div>
  </div>

  <div class="grid">
    <div class="section">
      <div class="label">Why (signals)</div>
      ${
                Array.isArray(deep.why?.signals) && deep.why.signals.length
                    ? `<ul>${deep.why.signals.map((s: string) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
                    : `<div class="muted">—</div>`
            }
    </div>
    <div class="section">
      <div class="label">Underserved</div>
      <div>${escapeHtml(deep.why?.underserved || "—")}</div>
    </div>
  </div>

  <div class="section">
    <div class="label">Stability (2–5 years)</div>
    <div>${escapeHtml(deep.why?.stability || "—")}</div>
  </div>

  <div class="section">
    <div class="label">What this realistically pays</div>
    <ul>
      <li><b>Typical price:</b> ${escapeHtml(deep.money?.typicalPriceRange || "—")}</li>
      <li><b>Clients for $1k/mo:</b> ${escapeHtml(deep.money?.clientsFor1k || "—")}</li>
      <li><b>30–60 day realism:</b> ${escapeHtml(deep.money?.realism30to60Days || "—")}</li>
    </ul>
  </div>

  <div class="section">
    <div class="label">How to test this safely (bounded)</div>
    <ul>
      <li><b>Goal:</b> ${escapeHtml(deep.testPlan?.goal || "—")}</li>
      <li><b>Method:</b> ${escapeHtml(deep.testPlan?.method || "—")}</li>
      <li><b>Success signal:</b> ${escapeHtml(deep.testPlan?.successSignal || "—")}</li>
      <li><b>Failure signal:</b> ${escapeHtml(deep.testPlan?.failureSignal || "—")}</li>
      <li><b>Time cap:</b> ${escapeHtml(deep.testPlan?.timeCap || "—")}</li>
    </ul>
  </div>

  <div class="section">
    <div class="label">Your first real move (copy/paste)</div>
    <div class="muted">Artifact: ${escapeHtml(deep.firstMove?.type || "—")}</div>
    <div style="margin-top:8px; white-space: pre-wrap; border: 1px solid #eee; border-radius: 10px; padding: 10px;">
      ${escapeHtml(deep.firstMove?.content || "—")}
    </div>
  </div>

  <div class="section">
    <div class="label">Kill switch (when to stop)</div>
    ${
                Array.isArray(deep.killSwitch) && deep.killSwitch.length
                    ? `<ul>${deep.killSwitch.map((s: string) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
                    : `<div class="muted">—</div>`
            }
  </div>
`
            : `
  <div class="section">
    <div class="label">Decision-Grade Validation</div>
    <div class="muted">Not included (free report).</div>
  </div>
`;

        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; color: #111; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { color: #555; margin: 0 0 16px; font-size: 12px; }
    .chip { display: inline-block; padding: 4px 10px; border: 1px solid #ddd; border-radius: 999px; font-size: 12px; margin-right: 8px; }
    .section { margin: 16px 0; padding: 14px; border: 1px solid #e5e5e5; border-radius: 12px; }
    .label { font-weight: 600; margin-bottom: 8px; }
    .muted { color: #666; font-size: 12px; }
    ul, ol { margin: 8px 0 0 22px; }
    li { margin: 4px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(subtitle)}</p>

  <div>
    <span class="chip">Instant</span>
    <span class="chip">Confidence: ${escapeHtml(confidenceLabel)}</span>
    <span class="chip">${escapeHtml(instant.meta?.lane ?? "Lane")}</span>
  </div>

  <div class="section">
    <div class="label">Your Micro-Niche</div>
    <div>${escapeHtml(instant.microNiche || "—")}</div>
  </div>

  <div class="grid">
    <div class="section">
      <div class="label">Core Problem</div>
      <div>${escapeHtml(instant.coreProblem || "—")}</div>
    </div>
    <div class="section">
      <div class="label">First Service</div>
      <div><b>${escapeHtml(instant.firstService?.name || "—")}</b></div>
      <div class="muted">${escapeHtml(instant.firstService?.outcome || "—")}</div>
    </div>
  </div>

  <div class="section">
    <div class="label">Where to Find First Buyers</div>
    ${listHtml(instant.buyerPlaces)}
  </div>

  <div class="section">
    <div class="label">One Action Today</div>
    <div>${escapeHtml(instant.oneActionToday || "—")}</div>
  </div>

  <div class="section">
    <div class="label">If you had 15 minutes</div>
    ${
            Array.isArray(quick15) && quick15.length
                ? `<ul>${quick15.map((s: string) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
                : `<div class="muted">—</div>`
        }
  </div>

  ${paidHtml}

  <script>
    window.onload = () => setTimeout(() => window.print(), 200);
  </script>
</body>
</html>`;

        const w = window.open("", "_blank");
        if (!w) {
            alert("Popup blocked. Allow popups for this site to download the PDF.");
            return;
        }

        // Avoid document.write (deprecated). Use DOM APIs instead.
        w.document.title = title;

        const doc = w.document;

        // Ensure we have a head/body to work with
        const head = doc.head ?? doc.getElementsByTagName("head")[0] ?? doc.createElement("head");
        const body = doc.body ?? doc.getElementsByTagName("body")[0] ?? doc.createElement("body");

        if (!doc.head) doc.documentElement.appendChild(head);
        if (!doc.body) doc.documentElement.appendChild(body);

        // Parse HTML and replace the document contents cleanly
        const parser = new DOMParser();
        const parsed = parser.parseFromString(html, "text/html");

        doc.documentElement.lang = parsed.documentElement.lang || "en";

        head.innerHTML = parsed.head?.innerHTML ?? "";
        body.innerHTML = parsed.body?.innerHTML ?? "";

        w.focus();
        setTimeout(() => w.print(), 250);
    };

    /** -----------------------------
     *  Render
     *  ----------------------------- */

    const unlockText = passLabel(paidUnlocked, passExpiresAt, secondsRemaining);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-4 py-10">
                <header className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full">
                            Built for solo founders
                        </Badge>
                    </div>

                    <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                        Find a profitable micro-niche you can start serving this week.
                    </h1>

                    <p className="text-muted-foreground max-w-2xl">
                        One click. No prompts. No hype. Get a realistic niche, the first service to offer, and where to find buyers — instantly.
                    </p>
                </header>

                <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Controls */}
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Wand2 className="h-5 w-5" /> Your Setup
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label>What do you want?</Label>
                                <div className="grid grid-cols-2 gap-2 items-stretch">
                                    <Button
                                        variant={mode === "instant" ? "default" : "outline"}
                                        className="rounded-2xl h-full min-h-[48px] flex items-center justify-center gap-2 px-3 py-2 text-center whitespace-normal leading-snug"
                                        onClick={() => setMode("instant")}
                                    >
                                        <Sparkles className="h-4 w-4 shrink-0" />
                                        <span className="flex flex-col items-center leading-tight">
                      <span>Free Instant Result</span>
                      <span className="text-[10px] opacity-50 tracking-wide">Recommended</span>
                    </span>
                                    </Button>

                                    <Button
                                        variant={mode === "deep" ? "default" : "outline"}
                                        className="rounded-2xl h-full min-h-[48px] flex items-center justify-center gap-2 px-3 py-2 text-center whitespace-normal leading-snug"
                                        onClick={() => setMode("deep")}
                                    >
                                        <ShieldCheck className="h-4 w-4 shrink-0" />
                                        <span className="block">Full Validation</span>
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">You’ll see the instant result first. Validation is an optional upgrade.</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Industry</Label>
                                <Select value={laneId} onValueChange={setLaneId}>
                                    <SelectTrigger className="rounded-2xl">
                                        <SelectValue placeholder="Choose a lane" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {lanes.map((l) => (
                                            <SelectItem key={l.id} value={l.id}>
                                                {l.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Time you can commit</Label>
                                    <Select value={timeId} onValueChange={setTimeId}>
                                        <SelectTrigger className="rounded-2xl">
                                            <SelectValue placeholder="Time" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {timeOptions.map((t) => (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Level</Label>
                                    <Select value={levelId} onValueChange={setLevelId}>
                                        <SelectTrigger className="rounded-2xl">
                                            <SelectValue placeholder="Level" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {levelOptions.map((t) => (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Anything we should know? (optional)</Label>
                                <Textarea
                                    className="rounded-2xl"
                                    placeholder="e.g., 'I hate outreach' or 'I can do Notion + spreadsheets'"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">Optional. Leave blank if you want.</p>
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <Label className="flex items-center gap-2">Avoid showing the same idea twice</Label>
                                    <p className="text-xs text-muted-foreground">Keeps results fresh while you explore.</p>
                                </div>
                                <Switch checked={avoidRepeats} onCheckedChange={setAvoidRepeats} />
                            </div>

                            <Button className="w-full rounded-2xl" onClick={onGenerate} disabled={!userReady || isGenerating}>
                                {isGenerating ? (
                                    <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finding your niche…
                  </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                    Find My Micro-Niche <ChevronRight className="h-4 w-4" />
                  </span>
                                )}
                            </Button>

                            <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                    Session: <span className="font-medium">{history.length}</span> generated /{" "}
                                    <span className="font-medium">{saved.length}</span> saved
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="rounded-2xl"
                                        onClick={() => (CLEAR_WIPES_LISTS ? clearEverything() : clearCurrent())}
                                        disabled={!instant && !deep && (!CLEAR_WIPES_LISTS || (!history.length && !saved.length))}
                                        title={CLEAR_WIPES_LISTS ? "Clear everything" : "Clear current result"}
                                    >
                                        {CLEAR_WIPES_LISTS ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>

                            {!CLEAR_WIPES_LISTS ? (
                                <div className="text-[11px] text-muted-foreground">
                                    Tip: “Clear” resets only the current result. History/Saved persist across refreshes.
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    {/* Right: Result + Lists */}
                    <Card className="rounded-2xl shadow-sm lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between gap-3">
                            <div>
                                <CardTitle className="text-lg">Your Result</CardTitle>
                                <p className="text-sm text-muted-foreground">A practical niche you could realistically monetize.</p>
                            </div>

                            <Tabs value={"user"}>
                                <TabsList className="rounded-2xl">
                                    <TabsTrigger value="user" className="rounded-2xl">
                                        User
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </CardHeader>

                        <CardContent>
                            {/* History + Saved ALWAYS VISIBLE */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                                <Card className="rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <History className="h-4 w-4" /> History
                                            <Badge variant="secondary" className="rounded-full">
                                                {visibleHistory.length}
                                            </Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2 max-h-[320px] overflow-auto">
                                        {visibleHistory.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">Generate to populate history.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {visibleHistory.slice(0, 30).map((h) => {
                                                    const k = keyForInstant(h);
                                                    return (
                                                        <div key={k} className="rounded-2xl border p-3 flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                    <Badge variant="outline" className="rounded-full">
                                                                        {h.meta?.lane ?? "Lane"}
                                                                    </Badge>
                                                                    <Badge variant="secondary" className="rounded-full">
                                                                        {h.meta?.confidence ?? "Medium"}
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-sm font-medium truncate">{short(h.microNiche, 80)}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Button variant="outline" className="rounded-2xl" onClick={() => selectResult(h)}>
                                                                    Use
                                                                </Button>
                                                                <Button variant="outline" className="rounded-2xl" onClick={() => toggleSave(h)} title="Star">
                                                                    <StarOff className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className="rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Star className="h-4 w-4" /> Saved
                                            <Badge variant="secondary" className="rounded-full">
                                                {saved.length}
                                            </Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2 max-h-[320px] overflow-auto">
                                        {saved.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">Star any result to save it here.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {saved.slice(0, 30).map((s) => {
                                                    const k = keyForInstant(s);
                                                    return (
                                                        <div key={k} className="rounded-2xl border p-3 flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                    <Badge variant="outline" className="rounded-full">
                                                                        {s.meta?.lane ?? "Lane"}
                                                                    </Badge>
                                                                    <Badge variant="secondary" className="rounded-full">
                                                                        {s.meta?.confidence ?? "Medium"}
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-sm font-medium truncate">{short(s.microNiche, 80)}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Button variant="outline" className="rounded-2xl" onClick={() => selectResult(s)}>
                                                                    Use
                                                                </Button>
                                                                <Button variant="default" className="rounded-2xl" onClick={() => toggleSave(s)} title="Unsave">
                                                                    <Star className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Main result */}
                            <AnimatePresence mode="wait">
                                {!instant ? (
                                    <motion.div
                                        key="empty"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="rounded-2xl border p-6 text-center"
                                    >
                                        <div className="mx-auto max-w-md space-y-4">
                                            <p className="text-sm text-muted-foreground">You’re one click away.</p>

                                            <p className="text-base">
                                                Choose an industry — or let us surprise you — then click{" "}
                                                <span className="font-medium">Find My Micro-Niche</span>.
                                            </p>

                                            <ul className="mt-2 text-sm text-muted-foreground space-y-2 text-left">
                                                <li>• A specific, realistic micro-niche</li>
                                                <li>• The first service you could offer</li>
                                                <li>• Where to find your first buyers</li>
                                            </ul>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="result"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="space-y-4"
                                    >
                                        {/* Micro-Niche */}
                                        <Card className="rounded-2xl border-2 bg-muted/30">
                                            <CardHeader>
                                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge className="rounded-full">Instant Proof</Badge>
                                                        <Badge variant="outline" className="rounded-full">
                                                            {instant.meta?.lane ?? "Lane"}
                                                        </Badge>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <Button variant="outline" className="rounded-2xl" onClick={clearCurrent} title="Clear result">
                                                            Clear
                                                        </Button>

                                                        <Button
                                                            variant="outline"
                                                            className="rounded-2xl"
                                                            onClick={onGenerate}
                                                            disabled={isGenerating}
                                                            title="Try another"
                                                        >
                                                            Try another
                                                        </Button>

                                                        <Button
                                                            variant="outline"
                                                            className="rounded-2xl"
                                                            onClick={onDownloadPdf}
                                                            title="Download PDF (prints a report you can Save as PDF)"
                                                        >
                                                            <Download className="h-4 w-4 mr-2" />
                                                            PDF
                                                        </Button>

                                                        <Button
                                                            variant={isSaved ? "default" : "outline"}
                                                            className="rounded-2xl"
                                                            onClick={() => toggleSave(instant)}
                                                            title={isSaved ? "Remove" : "Star"}
                                                        >
                                                            {isSaved ? <Star className="h-4 w-4 mr-2" /> : <StarOff className="h-4 w-4 mr-2" />}
                                                            {isSaved ? "Starred" : "Star"}
                                                        </Button>
                                                    </div>
                                                </div>

                                                <CardTitle className="text-base mt-2">Your Micro-Niche</CardTitle>
                                            </CardHeader>
                                            <CardContent className="text-base leading-relaxed">{instant.microNiche}</CardContent>
                                        </Card>

                                        {/* Confidence */}
                                        <div
                                            className={`
                        rounded-2xl border p-4 space-y-2
                        ${
                                                confidenceLabel === "High"
                                                    ? "border-green-300 bg-green-50/50"
                                                    : confidenceLabel === "Medium"
                                                        ? "border-amber-300 bg-amber-50/50"
                                                        : "border-rose-300 bg-rose-50/50"
                                            }
                      `}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className="rounded-full">
                                                    Confidence: {confidenceLabel}
                                                </Badge>
                                            </div>

                                            <div className="text-sm text-muted-foreground">
                                                <span className="font-medium text-foreground">Why this rating:</span> {confidenceWhy}
                                            </div>

                                            {confidenceDrivers.length > 0 && (
                                                <div className="pt-1">
                                                    <div className="text-sm font-medium">What drove the rating</div>
                                                    <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                                        {confidenceDrivers.map((d: string, i: number) => (
                                                            <li key={i}>{d}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {confidenceRaise.length > 0 && (
                                                <div className="pt-2">
                                                    <div className="text-sm font-medium">What would raise confidence</div>
                                                    <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                                        {confidenceRaise.map((x: string, i: number) => (
                                                            <li key={i}>{x}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Card className="rounded-2xl">
                                                <CardHeader>
                                                    <CardTitle className="text-base">Core Problem</CardTitle>
                                                </CardHeader>
                                                <CardContent className="text-sm leading-relaxed">
                                                    {instant.coreProblem?.trim() ? instant.coreProblem : "No clear problem returned — click “Try another”."}
                                                </CardContent>
                                            </Card>

                                            <Card className="rounded-2xl">
                                                <CardHeader>
                                                    <CardTitle className="text-base">First Service to Offer</CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-2">
                                                    <div className="text-sm font-medium">{instant?.firstService?.name ?? "—"}</div>
                                                    <div className="text-sm text-muted-foreground">{instant?.firstService?.outcome ?? "—"}</div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        <Card className="rounded-2xl">
                                            <CardHeader>
                                                <CardTitle className="text-base">Where to Find First Buyers</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <ul className="list-disc pl-5 text-sm space-y-1">
                                                    {(instant?.buyerPlaces ?? []).length ? (
                                                        (instant.buyerPlaces ?? []).map((p: string, i: number) => <li key={i}>{p}</li>)
                                                    ) : (
                                                        <li className="text-muted-foreground">No buyer locations returned — click “Try another”.</li>
                                                    )}
                                                </ul>
                                            </CardContent>
                                        </Card>

                                        <Card className="rounded-2xl">
                                            <CardHeader>
                                                <CardTitle className="text-base">One Action Today</CardTitle>
                                            </CardHeader>
                                            <CardContent className="text-sm">{instant.oneActionToday}</CardContent>
                                        </Card>

                                        {instant && (
                                            <QuickStart15 steps={buildQuickStart15Steps(instant)} />
                                        )}

                                        {/* Full Validation */}
                                        <div ref={deepSectionRef}>
                                            <Card className="rounded-2xl border-dashed">
                                                <CardHeader className="flex flex-row items-center justify-between gap-3">
                                                    <div>
                                                        <CardTitle className="text-base">Want the full validation?</CardTitle>
                                                        <p className="text-sm text-muted-foreground">Best for people who don’t want to guess.</p>

                                                        <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                                                            <li>• Verdict: BUILD / TEST / AVOID</li>
                                                            <li>• Money anchor + bounded test plan</li>
                                                            <li>• Copy/paste first move + kill switch</li>
                                                        </ul>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {paidUnlocked ? (
                                                            <Badge variant="secondary" className="rounded-full flex items-center gap-1">
                                                                <Unlock className="h-3 w-3" />
                                                                {unlockText}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="rounded-full flex items-center gap-1">
                                                                <Lock className="h-3 w-3" />
                                                                {unlockText}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </CardHeader>

                                                <CardContent className="flex flex-col md:flex-row gap-3 md:items-start md:justify-between">
                                                    <div className="space-y-3 max-w-md text-sm text-muted-foreground">
                                                        <div>One-time unlock — $27 • No subscription</div>
                                                        <div className="text-xs text-muted-foreground space-y-1">
                                                            <div>This is an instant, one-time analysis.</div>
                                                            <div>All purchases are final once the report is delivered.</div>
                                                            <div>If a technical issue prevents delivery, we’ll refund immediately.</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-1">
                                                        {!paidUnlocked ? (
                                                            <>
                                                                <Button className="rounded-2xl" onClick={onUnlockDeep} disabled={!instant || isUnlocking}>
                                                                    {isUnlocking ? (
                                                                        <span className="flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Opening secure checkout…
                                    </span>
                                                                    ) : (
                                                                        "Unlock Full Validation"
                                                                    )}
                                                                </Button>
                                                                <div className="text-xs text-muted-foreground">Secure checkout via Stripe · No subscription</div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button className="rounded-2xl" onClick={onGenerateDeep} disabled={!instant || isDeepLoading}>
                                                                    {isDeepLoading ? (
                                                                        <span className="flex items-center gap-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Running validation…
                                    </span>
                                                                    ) : (
                                                                        "Run Full Validation"
                                                                    )}
                                                                </Button>
                                                                <div className="text-xs text-muted-foreground">Instant delivery · Same report</div>
                                                            </>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        {mode === "deep" && !paidUnlocked ? (
                                            <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                                                You selected <span className="font-medium">Full Validation</span>. Click{" "}
                                                <span className="font-medium">Unlock Full Validation</span> to pay and unlock.
                                            </div>
                                        ) : null}

                                        {/* Paid Report (only when deep exists) */}
                                        <AnimatePresence mode="wait">
                                            {deep ? (
                                                <motion.div
                                                    key="paid"
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="space-y-4"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Badge className="rounded-full">Decision-Grade Validation</Badge>
                                                        <Badge variant="secondary" className="rounded-full">
                                                            Verdict: {deep.verdict}
                                                        </Badge>
                                                    </div>

                                                    {/* 1) Verdict */}
                                                    <Card className="rounded-2xl border-2">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">Verdict</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2">
                                                            <div className="text-sm">
                                                                <span className="font-medium">Decision:</span>{" "}
                                                                <span className="font-semibold">{deep.verdict}</span>
                                                            </div>
                                                            <div className="text-sm text-muted-foreground leading-relaxed">
                                                                {deep.verdict ?? "—"}
                                                            </div>
                                                        </CardContent>
                                                    </Card>

                                                    {/* 2) Why */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <Card className="rounded-2xl">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">Why (signals)</CardTitle>
                                                            </CardHeader>
                                                            <CardContent className="space-y-3">
                                                                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                                                    {(deep.why?.signals ?? []).map((s: string, i: number) => (
                                                                        <li key={i}>{s}</li>
                                                                    ))}
                                                                </ul>
                                                            </CardContent>
                                                        </Card>

                                                        <Card className="rounded-2xl">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">Underserved + Stability</CardTitle>
                                                            </CardHeader>
                                                            <CardContent className="space-y-3">
                                                                <div>
                                                                    <div className="text-sm font-medium">Why it’s underserved</div>
                                                                    <div className="text-sm text-muted-foreground leading-relaxed">
                                                                        {deep.why?.underserved ?? "—"}

                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-medium">Why it’s stable (2–5 years)</div>
                                                                    <div className="text-sm text-muted-foreground leading-relaxed">
                                                                        {deep.why?.stability ?? "—"}

                                                                    </div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    </div>

                                                    {/* 3) Money */}
                                                    <Card className="rounded-2xl">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">What this realistically pays</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2">
                                                            <div className="text-sm">
                                                                <span className="font-medium">Typical first offer price:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.money?.typicalPriceRange ?? "—"}</span>
                                                            </div>
                                                            <div className="text-sm">
                                                                <span className="font-medium">Clients for $1,000/month:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.money?.clientsFor1k ?? "—"}</span>
                                                            </div>
                                                            <div className="text-sm">
                                                                <span className="font-medium">30–60 day realism:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.money?.realism30to60Days ?? "—"}</span>
                                                            </div>

                                                        </CardContent>
                                                    </Card>

                                                    {/* 4) Test Plan */}
                                                    <Card className="rounded-2xl">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">How to test this safely (bounded)</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2">
                                                            <div className="text-sm">
                                                                <span className="font-medium">Goal:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.testPlan?.goal ?? "—"}</span>
                                                            </div>
                                                            <div className="text-sm">
                                                                <span className="font-medium">Method:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.testPlan?.method ?? "—"}</span>
                                                            </div>
                                                            <div className="text-sm">
                                                                <span className="font-medium">Success signal:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.testPlan?.successSignal ?? "—"}</span>
                                                            </div>
                                                            <div className="text-sm">
                                                                <span className="font-medium">Failure signal:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.testPlan?.failureSignal ?? "—"}</span>
                                                            </div>
                                                            <div className="text-sm">
                                                                <span className="font-medium">Time cap:</span>{" "}
                                                                <span className="text-muted-foreground">{deep.testPlan?.timeCap ?? "—"}</span>
                                                            </div>

                                                        </CardContent>
                                                    </Card>

                                                    {/* 5) First move */}
                                                    <Card className="rounded-2xl border-2">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">Your first real move (copy/paste)</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-3">
                                                            <Badge variant="outline" className="rounded-full w-fit">
                                                                Artifact: {deep.firstMove?.type ?? "—"}

                                                            </Badge>

                                                            <div className="rounded-2xl border bg-muted/30 p-3">
                                <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                                  {deep.firstMove?.content ?? "-"}
                                </pre>
                                                            </div>

                                                            <div className="text-xs text-muted-foreground">
                                                                Tip: personalize 1–2 details, then send it to 10 targets.
                                                            </div>
                                                        </CardContent>
                                                    </Card>

                                                    {/* 6) Kill switch */}
                                                    <Card className="rounded-2xl">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">Kill switch (when to stop)</CardTitle>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                                                {(deep.killSwitch ?? []).map((s: string, i: number) => (
                                                                    <li key={i}>{s}</li>
                                                                ))}
                                                            </ul>
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            ) : null}
                                        </AnimatePresence>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>
                </div>

                <footer className="mt-10 text-xs text-muted-foreground">
                    History/Saved persist locally (localStorage). Unlock persists via Stripe session verification.
                </footer>
            </div>
        </div>
    );
}
