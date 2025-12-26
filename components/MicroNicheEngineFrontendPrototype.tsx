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
    whyExists: string;
    proofSignals: string[];
    underserved: string;
    stability: string;
    executionPath: string[];
    expansionLater: string[];
    riskCheck: { risk: string; mitigation: string }[];
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

function short(s: string, max = 88) {
    if (!s) return s;
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Stable key so we can dedupe + star across refreshes.
function keyForInstant(x: any) {
    const lane = String(x?.meta?.lane ?? x?.lane ?? "Lane").trim();
    const micro = String(x?.microNiche ?? x?.micro_niche ?? x?.name ?? x?.micro ?? "Unknown").trim();
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
    return `<ul>${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
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
        instant?.meta?.confidenceWhy ??
        "Rating is based on buyer clarity, money proximity, and evidence strength.";
    const confidenceDrivers = instant?.meta?.confidenceDrivers ?? [];
    const confidenceRaise = instant?.meta?.confidenceRaise ?? [];

    const isSaved = useMemo(() => {
        if (!instant) return false;
        const k = keyForInstant(instant);
        return saved.some((s) => keyForInstant(s) === k);
    }, [instant, saved]);

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

    const useResult = (res: InstantProof) => {
        setInstant(res);
        setDeep(null);
        setMode("instant");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearCurrent = () => {
        setInstant(null);
        setDeep(null);
        setMode("instant");
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
                const j = (await r.json()) as VerifyResponse;

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
        // IMPORTANT: clear old deep immediately so the UI doesn't show old paid block
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
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.message || `Request failed: ${res.status}`);
            }

            const json = (await res.json()) as InstantProof;
            setInstant(json);
            addToHistory(json);

            if (mode === "deep") {
                setTimeout(() => {
                    deepSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 150);
            }

            // re-verify pass (keeps unlock across multiple niches)
            const sessionId = localStorage.getItem(LS_SESSION_KEY);
            if (sessionId) {
                try {
                    const vr = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`);
                    const vj = (await vr.json()) as VerifyResponse;
                    setPaidUnlocked(!!vj?.paid);
                    if (typeof vj?.passExpiresAt === "number") setPassExpiresAt(vj.passExpiresAt);
                    if (typeof vj?.secondsRemaining === "number") setSecondsRemaining(vj.secondsRemaining);
                } catch {
                    // leave current state
                }
            }
        } catch (e: any) {
            alert(`Instant generation failed: ${e?.message ?? "Unknown error"}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const onUnlockDeep = async () => {
        if (!instant) return;

        setIsUnlocking(true);
        try {
            const r = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j?.url) throw new Error(j?.error || "Checkout session creation failed.");
            window.location.href = j.url;
        } catch (e: any) {
            alert(`Checkout failed: ${e?.message ?? "Unknown error"}`);
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

            const j = await r.json().catch(() => ({}));

            if (r.status === 402) {
                setPaidUnlocked(false);
                alert("Full Validation is locked or expired. Please unlock again.");
                return;
            }
            if (!r.ok) throw new Error(j?.error || `Full Validation failed: ${r.status}`);

            const dp = j as DeepProof;
            setDeep(dp);
            setPaidUnlocked(true);

            if (typeof dp?.meta?.passExpiresAt === "number") setPassExpiresAt(dp.meta.passExpiresAt);
            if (typeof dp?.meta?.secondsRemaining === "number") setSecondsRemaining(dp.meta.secondsRemaining);

            // scroll to deep result
            setTimeout(() => {
                deepSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 150);
        } catch (e: any) {
            alert(`Full Validation failed: ${e?.message ?? "Unknown error"}`);
        } finally {
            setIsDeepLoading(false);
        }
    };

    const onDownloadPdf = () => {
        if (!instant) return;

        const title = `Micro-Niche Report`;
        const subtitle = `${instant.meta?.lane ?? "Lane"} • ${new Date().toLocaleString()}`;

        const html = `import QuickStart15 from "@/components/QuickStart15"; 
<!doctype html>
<html>
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
    <div>${escapeHtml(instant.microNiche)}</div>
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
<QuickStart15
  microNiche={instant.microNiche}
  coreProblem={instant.coreProblem}
  serviceName={instant.firstService?.name}
  serviceOutcome={instant.firstService?.outcome}
  buyerPlaces={instant.buyerPlaces}
/>

  ${
            deep
                ? `
  <div style="page-break-before: always;"></div>
  <div>
    <span class="chip">Full Validation</span>
    <span class="chip">${escapeHtml(passLabel(true, passExpiresAt, secondsRemaining))}</span>
  </div>

  <div class="grid">
    <div class="section">
      <div class="label">Why this niche exists</div>
      <div>${escapeHtml(deep.whyExists)}</div>
    </div>
    <div class="section">
      <div class="label">Why it’s underserved</div>
      <div>${escapeHtml(deep.underserved)}</div>
    </div>
  </div>

  <div class="section">
    <div class="label">Proof signals used</div>
    ${listHtml(deep.proofSignals)}
  </div>

  <div class="section">
    <div class="label">Why it’s stable (2–5 years)</div>
    <div>${escapeHtml(deep.stability)}</div>
  </div>

  <div class="section">
    <div class="label">Execution path (7–14 days)</div>
    ${
                    Array.isArray(deep.executionPath) && deep.executionPath.length
                        ? `<ol>${deep.executionPath.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>`
                        : `<div class="muted">—</div>`
                }
  </div>

  <div class="grid">
    <div class="section">
      <div class="label">Expansion (later)</div>
      ${listHtml(deep.expansionLater)}
    </div>
    <div class="section">
      <div class="label">Risk check</div>
      ${
                    Array.isArray(deep.riskCheck) && deep.riskCheck.length
                        ? deep.riskCheck
                            .map(
                                (r) => `
                <div style="border:1px solid #eee;border-radius:10px;padding:10px;margin:8px 0;">
                  <div><b>${escapeHtml(r.risk)}</b></div>
                  <div class="muted">${escapeHtml(r.mitigation)}</div>
                </div>`
                            )
                            .join("")
                        : `<div class="muted">—</div>`
                }
    </div>
  </div>
  `
                : `
  <div class="section">
    <div class="label">Full Validation</div>
    <div class="muted">Not included (free report).</div>
  </div>
  `
        }

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
        w.document.open();
        w.document.write(html);
        w.document.close();
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
                                                {history.length}
                                            </Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-2">
                                        {history.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">Generate to populate history.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {history.slice(0, 8).map((h) => {
                                                    const k = keyForInstant(h);
                                                    const isHsaved = saved.some((s) => keyForInstant(s) === k);
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
                                                                <Button variant="outline" className="rounded-2xl" onClick={() => useResult(h)}>
                                                                    Use
                                                                </Button>
                                                                <Button
                                                                    variant={isHsaved ? "default" : "outline"}
                                                                    className="rounded-2xl"
                                                                    onClick={() => toggleSave(h)}
                                                                    title={isHsaved ? "Remove" : "Star"}
                                                                >
                                                                    {isHsaved ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4" />}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {history.length > 8 && <div className="text-xs text-muted-foreground">Showing 8 of {history.length}.</div>}
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
                                    <CardContent className="space-y-2">
                                        {saved.length === 0 ? (
                                            <div className="text-sm text-muted-foreground">Star any result to save it here.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {saved.slice(0, 8).map((s) => {
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
                                                                <Button variant="outline" className="rounded-2xl" onClick={() => useResult(s)}>
                                                                    Use
                                                                </Button>
                                                                <Button variant="default" className="rounded-2xl" onClick={() => toggleSave(s)} title="Unsave">
                                                                    <Star className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {saved.length > 8 && <div className="text-xs text-muted-foreground">Showing 8 of {saved.length}.</div>}
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
                                                        {confidenceDrivers.map((d, i) => (
                                                            <li key={i}>{d}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {confidenceRaise.length > 0 && (
                                                <div className="pt-2">
                                                    <div className="text-sm font-medium">What would raise confidence</div>
                                                    <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                                        {confidenceRaise.map((x, i) => (
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
                                                        (instant.buyerPlaces ?? []).map((p, i) => <li key={i}>{p}</li>)
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

                                        {/* Full Validation */}
                                        <div ref={deepSectionRef}>
                                            <Card className="rounded-2xl border-dashed">
                                                <CardHeader className="flex flex-row items-center justify-between gap-3">
                                                    <div>
                                                        <CardTitle className="text-base">Want the full validation?</CardTitle>
                                                        <p className="text-sm text-muted-foreground">Best for people who don’t want to guess.</p>

                                                        <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                                                            <li>• Confirms whether this niche is actually viable</li>
                                                            <li>• Shows demand signals and stability (2–5 years)</li>
                                                            <li>• Flags risks before you invest time or money</li>
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

                                        <AnimatePresence mode="wait">
                                            {deep ? (
                                                <motion.div
                                                    key="deep"
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className="space-y-4"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Badge className="rounded-full">Full Validation</Badge>
                                                        <Badge variant="secondary" className="rounded-full">
                                                            Same niche
                                                        </Badge>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <Card className="rounded-2xl">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">Why this niche exists</CardTitle>
                                                            </CardHeader>
                                                            <CardContent className="text-sm text-muted-foreground leading-relaxed">{deep.whyExists}</CardContent>
                                                        </Card>

                                                        <Card className="rounded-2xl">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">Why it’s underserved</CardTitle>
                                                            </CardHeader>
                                                            <CardContent className="text-sm text-muted-foreground leading-relaxed">{deep.underserved}</CardContent>
                                                        </Card>
                                                    </div>

                                                    <Card className="rounded-2xl">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">Proof signals used</CardTitle>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <ul className="list-disc pl-5 text-sm space-y-1">
                                                                {deep.proofSignals.map((s, i) => (
                                                                    <li key={i}>{s}</li>
                                                                ))}
                                                            </ul>
                                                        </CardContent>
                                                    </Card>

                                                    <Card className="rounded-2xl">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">Why it’s stable (2–5 years)</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="text-sm text-muted-foreground leading-relaxed">{deep.stability}</CardContent>
                                                    </Card>

                                                    <Card className="rounded-2xl">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">Execution path (7–14 days)</CardTitle>
                                                        </CardHeader>
                                                        <CardContent>
                                                            <ol className="list-decimal pl-5 text-sm space-y-1">
                                                                {deep.executionPath.map((s, i) => (
                                                                    <li key={i}>{s}</li>
                                                                ))}
                                                            </ol>
                                                        </CardContent>
                                                    </Card>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <Card className="rounded-2xl">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">Expansion (later)</CardTitle>
                                                            </CardHeader>
                                                            <CardContent>
                                                                <ul className="list-disc pl-5 text-sm space-y-1">
                                                                    {deep.expansionLater.map((s, i) => (
                                                                        <li key={i}>{s}</li>
                                                                    ))}
                                                                </ul>
                                                            </CardContent>
                                                        </Card>

                                                        <Card className="rounded-2xl">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">Risk check</CardTitle>
                                                            </CardHeader>
                                                            <CardContent className="space-y-2">
                                                                {deep.riskCheck.map((r, i) => (
                                                                    <div key={i} className="rounded-2xl border p-3">
                                                                        <div className="text-sm font-medium">{r.risk}</div>
                                                                        <div className="text-sm text-muted-foreground">{r.mitigation}</div>
                                                                    </div>
                                                                ))}
                                                            </CardContent>
                                                        </Card>
                                                    </div>
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
