"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight, Sparkles, ShieldCheck, Lock, Unlock, Wand2, Star, StarOff, History } from "lucide-react";
import QuickStart15 from "@/components/QuickStart15";


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
};

function short(s: string, max = 88) {
    if (!s) return s;
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function safeString(v: unknown, fallback = ""): string {
    if (typeof v === "string") return v;
    if (v === null || v === undefined) return fallback;
    return String(v);
}

function keyForInstant(x: unknown) {
    const obj = (typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {}) as Record<string, unknown>;
    const meta = (typeof obj.meta === "object" && obj.meta !== null ? (obj.meta as Record<string, unknown>) : {}) as Record<
        string,
        unknown
    >;

    const lane = safeString(meta.lane ?? obj.lane, "Lane").trim();
    const micro = safeString(obj.microNiche ?? obj.micro_niche ?? obj.name, "Unknown").trim();
    return `${lane}::${micro}`;
}

// Stripe/session key
const LS_SESSION_KEY = "mne_session_id";

// Persistence keys for “return from Stripe and keep context”
const LS_HISTORY_KEY = "mne_history_v1";
const LS_SAVED_KEY = "mne_saved_v1";
const LS_LAST_INSTANT_KEY = "mne_last_instant_v1";
const LS_UNLOCK_UNTIL_KEY = "mne_unlock_until_v1";

// You can change this easily (e.g., 15 minutes)
const UNLOCK_WINDOW_MINUTES = 10;

function readJson<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore storage errors
    }
}

function clampArray<T>(arr: T[], max = 30): T[] {
    return arr.slice(0, max);
}

export default function MicroNicheEngineFrontendPrototype() {
    const [mode, setMode] = useState<"instant" | "deep">("instant");
    const [perspective, setPerspective] = useState<"user" | "builder">("user");

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

    // Lists (persisted)
    const [history, setHistory] = useState<InstantProof[]>([]);
    const [saved, setSaved] = useState<InstantProof[]>([]);
    const [avoidRepeats, setAvoidRepeats] = useState(true);

    // Countdown (persisted)
    const [unlockUntil, setUnlockUntil] = useState<number | null>(null);
    const [nowTick, setNowTick] = useState<number>(() => Date.now());

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

    const secondsLeft = useMemo(() => {
        if (!unlockUntil) return 0;
        const ms = unlockUntil - nowTick;
        return ms > 0 ? Math.ceil(ms / 1000) : 0;
    }, [unlockUntil, nowTick]);

    const mmssLeft = useMemo(() => {
        const s = secondsLeft;
        const mm = Math.floor(s / 60);
        const ss = s % 60;
        return `${mm}:${String(ss).padStart(2, "0")}`;
    }, [secondsLeft]);

    // ---------- Persistence: rehydrate on first mount ----------
    useEffect(() => {
        // Restore history/saved/last instant
        const h = readJson<InstantProof[]>(LS_HISTORY_KEY) ?? [];
        const s = readJson<InstantProof[]>(LS_SAVED_KEY) ?? [];
        const last = readJson<InstantProof>(LS_LAST_INSTANT_KEY);

        if (Array.isArray(h)) setHistory(clampArray(h, 30));
        if (Array.isArray(s)) setSaved(clampArray(s, 30));
        if (last && typeof last === "object") {
            setInstant(last);
        }

        // Restore unlock window timestamp
        const until = readJson<number>(LS_UNLOCK_UNTIL_KEY);
        if (typeof until === "number" && Number.isFinite(until)) {
            setUnlockUntil(until);
        }
    }, []);

    // Keep a ticking “now” for countdown
    useEffect(() => {
        const id = window.setInterval(() => setNowTick(Date.now()), 250);
        return () => window.clearInterval(id);
    }, []);

    // If the window expired, show locked UI (but don’t delete the verified session id)
    useEffect(() => {
        if (!unlockUntil) return;
        if (unlockUntil <= nowTick) {
            // window expired
            setPaidUnlocked(false);
        }
    }, [unlockUntil, nowTick]);

    // Persist history/saved/instant whenever they change
    useEffect(() => {
        writeJson(LS_HISTORY_KEY, history);
    }, [history]);

    useEffect(() => {
        writeJson(LS_SAVED_KEY, saved);
    }, [saved]);

    useEffect(() => {
        if (instant) writeJson(LS_LAST_INSTANT_KEY, instant);
    }, [instant]);

    useEffect(() => {
        if (unlockUntil) writeJson(LS_UNLOCK_UNTIL_KEY, unlockUntil);
    }, [unlockUntil]);

    // ---------- Stripe session capture + verify ----------
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");
        if (sessionId) {
            localStorage.setItem(LS_SESSION_KEY, sessionId);
        }
    }, []);

    useEffect(() => {
        const sessionId = localStorage.getItem(LS_SESSION_KEY);
        if (!sessionId) return;

        (async () => {
            try {
                const r = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`);
                const j = (await r.json().catch(() => ({}))) as { paid?: boolean };
                const paid = !!j?.paid;

                setPaidUnlocked(paid);

                // If paid, open a time window for “deep proof”
                if (paid) {
                    const until = Date.now() + UNLOCK_WINDOW_MINUTES * 60_000;
                    setUnlockUntil(until);
                }
            } catch {
                setPaidUnlocked(false);
            }
        })();
    }, []);

    // ---------- Session helpers ----------
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

    const applyResult = (res: InstantProof) => {
        setInstant(res);
        setDeep(null);
        // Do NOT nuke unlock state here — it’s valid for the session/window.
        setPerspective("user");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearSession = () => {
        setHistory([]);
        setSaved([]);
        setInstant(null);
        setDeep(null);
        // Keep Stripe session id; user paid. Clear unlock window though.
        setPaidUnlocked(false);
        setUnlockUntil(null);

        try {
            localStorage.removeItem(LS_HISTORY_KEY);
            localStorage.removeItem(LS_SAVED_KEY);
            localStorage.removeItem(LS_LAST_INSTANT_KEY);
            localStorage.removeItem(LS_UNLOCK_UNTIL_KEY);
        } catch {
            // ignore
        }
    };

    // ---------- Actions ----------
    const onGenerate = async () => {
        setIsGenerating(true);
        setDeep(null);

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
                const err = (await res.json().catch(() => ({}))) as { message?: string };
                throw new Error(err?.message || `Request failed: ${res.status}`);
            }

            const json = (await res.json()) as InstantProof;
            setInstant(json);
            addToHistory(json);

            // If we have a valid paid session already, keep it unlocked
            const sessionId = localStorage.getItem(LS_SESSION_KEY);
            if (sessionId) {
                try {
                    const vr = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`);
                    const vj = (await vr.json().catch(() => ({}))) as { paid?: boolean };
                    const paid = !!vj?.paid;
                    setPaidUnlocked(paid);
                    if (paid) {
                        const until = Date.now() + UNLOCK_WINDOW_MINUTES * 60_000;
                        setUnlockUntil(until);
                    }
                } catch {
                    setPaidUnlocked(false);
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            alert(`Instant generation failed: ${msg}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const onUnlockDeep = async () => {
        if (!instant) return;

        // Persist the current context BEFORE redirect (this is the key fix)
        writeJson(LS_LAST_INSTANT_KEY, instant);
        writeJson(LS_HISTORY_KEY, history);
        writeJson(LS_SAVED_KEY, saved);

        setIsUnlocking(true);
        try {
            const r = await fetch("/api/stripe/create-checkout-session", { method: "POST" });
            const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
            if (!r.ok || !j?.url) throw new Error(j?.error || "Checkout session creation failed.");
            window.location.href = j.url;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            alert(`Checkout failed: ${msg}`);
        } finally {
            setIsUnlocking(false);
        }
    };

    const onGenerateDeep = async () => {
        if (!instant) return;

        const sessionId = localStorage.getItem(LS_SESSION_KEY);
        if (!sessionId) {
            alert("No Stripe session found. Click Unlock Deep Proof first.");
            return;
        }

        // Optional: enforce countdown window client-side too
        if (unlockUntil && unlockUntil <= Date.now()) {
            setPaidUnlocked(false);
            alert("Your Deep Proof window expired. Please unlock again.");
            return;
        }

        setIsDeepLoading(true);
        try {
            const r = await fetch("/api/generate/deep", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    instant,
                    notes,
                }),
            });

            const j = (await r.json().catch(() => ({}))) as { error?: string };

            if (r.status === 402) {
                setPaidUnlocked(false);
                alert("Deep Proof is locked. Payment not verified for this session.");
                return;
            }
            if (!r.ok) throw new Error(j?.error || `Deep Proof failed: ${r.status}`);

            setDeep(j as unknown as DeepProof);
            setPaidUnlocked(true);

            // Refresh/extend the countdown window when deep is generated successfully
            const until = Date.now() + UNLOCK_WINDOW_MINUTES * 60_000;
            setUnlockUntil(until);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            alert(`Deep Proof failed: ${msg}`);
        } finally {
            setIsDeepLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-4 py-10">
                <header className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="rounded-full">
                            Prototype
                        </Badge>
                        <Badge variant="outline" className="rounded-full">
                            Solo founders / side-hustlers
                        </Badge>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                        Find a real micro-niche you can actually make money serving.
                    </h1>
                    <p className="text-muted-foreground max-w-2xl">
                        One-click value. The AI stays invisible. Instant Proof is free; Deep Proof shows the evidence and safer expansion paths.
                    </p>
                </header>

                <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Controls */}
                    <Card className="rounded-2xl shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Wand2 className="h-5 w-5" /> Inputs
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-5">
                            <div className="space-y-2">
                                <Label>Result depth</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant={mode === "instant" ? "default" : "outline"}
                                        className="rounded-2xl justify-start"
                                        onClick={() => setMode("instant")}
                                    >
                                        <Sparkles className="h-4 w-4 mr-2" /> Instant Proof
                                    </Button>
                                    <Button
                                        variant={mode === "deep" ? "default" : "outline"}
                                        className="rounded-2xl justify-start"
                                        onClick={() => setMode("deep")}
                                    >
                                        <ShieldCheck className="h-4 w-4 mr-2" /> Deep Proof
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">Deep Proof generates Instant Proof first, then offers an optional unlock.</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Lane</Label>
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
                                    <Label>Time</Label>
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
                                <Label>Optional note (constraints / familiarity)</Label>
                                <Textarea
                                    className="rounded-2xl"
                                    placeholder="e.g., 'I hate outreach' or 'I can do Notion + spreadsheets'"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">Optional. Users can run with near-zero input.</p>
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <Label className="flex items-center gap-2">
                                        Avoid repeats
                                        <Badge variant="secondary" className="rounded-full">
                                            Default
                                        </Badge>
                                    </Label>
                                    <p className="text-xs text-muted-foreground">Sends an avoid list from this session’s history.</p>
                                </div>
                                <Switch checked={avoidRepeats} onCheckedChange={setAvoidRepeats} />
                            </div>

                            <Button className="w-full rounded-2xl" onClick={onGenerate} disabled={!userReady || isGenerating}>
                                {isGenerating ? "Generating…" : "Generate"}
                                <ChevronRight className="h-4 w-4 ml-2" />
                            </Button>

                            <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                    Stored: <span className="font-medium">{history.length}</span> history / <span className="font-medium">{saved.length}</span> saved
                                </div>
                                <Button variant="outline" className="rounded-2xl" onClick={clearSession} disabled={!history.length && !saved.length && !instant}>
                                    Clear
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right: Preview + Panels */}
                    <Card className="rounded-2xl shadow-sm lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between gap-3">
                            <div>
                                <CardTitle className="text-lg">Preview</CardTitle>
                                <p className="text-sm text-muted-foreground">Test how an end user experiences the result.</p>
                            </div>

                            <Tabs value={perspective} onValueChange={(v) => setPerspective(v as "user" | "builder")} className="w-auto">
                                <TabsList className="rounded-2xl">
                                    <TabsTrigger value="user" className="rounded-2xl">
                                        User
                                    </TabsTrigger>
                                    <TabsTrigger value="builder" className="rounded-2xl">
                                        Builder / QA
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </CardHeader>

                        <CardContent>
                            {/* History/Saved panels */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                                <Card className="rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <History className="h-4 w-4" /> History (persisted)
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
                                                                <Button variant="outline" className="rounded-2xl" onClick={() => applyResult(h)}>
                                                                    Use
                                                                </Button>
                                                                <Button
                                                                    variant={isHsaved ? "default" : "outline"}
                                                                    className="rounded-2xl"
                                                                    onClick={() => toggleSave(h)}
                                                                    title={isHsaved ? "Unsave" : "Save"}
                                                                >
                                                                    {isHsaved ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4" />}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {history.length > 8 && (
                                                    <div className="text-xs text-muted-foreground">Showing 8 of {history.length}. (Easy to expand later.)</div>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className="rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Star className="h-4 w-4" /> Saved (persisted)
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
                                                                <Button variant="outline" className="rounded-2xl" onClick={() => applyResult(s)}>
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

                            <Tabs value={perspective}>
                                {/* USER VIEW */}
                                <TabsContent value="user">
                                    <AnimatePresence mode="wait">
                                        {!instant ? (
                                            <motion.div
                                                key="empty"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="rounded-2xl border p-6 text-center"
                                            >
                                                <div className="mx-auto max-w-md space-y-2">
                                                    <p className="text-sm text-muted-foreground">No result yet.</p>
                                                    <p className="text-base">
                                                        Choose a lane (or <span className="font-medium">Surprise me</span>) and click{" "}
                                                        <span className="font-medium">Generate</span>.
                                                    </p>
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
                                                {/* RESULT: Micro-Niche */}
                                                <Card className="rounded-2xl border-2 bg-muted/30">
                                                    <CardHeader>
                                                        <div className="flex flex-wrap items-center gap-2 justify-between">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Badge className="rounded-full">Instant Proof</Badge>
                                                                <Badge variant="outline" className="rounded-full">
                                                                    {instant.meta?.lane ?? "Lane"}
                                                                </Badge>
                                                            </div>

                                                            <Button
                                                                variant={isSaved ? "default" : "outline"}
                                                                className="rounded-2xl"
                                                                onClick={() => toggleSave(instant)}
                                                                title={isSaved ? "Unsave" : "Save"}
                                                            >
                                                                {isSaved ? <Star className="h-4 w-4 mr-2" /> : <StarOff className="h-4 w-4 mr-2" />}
                                                                {isSaved ? "Saved" : "Save"}
                                                            </Button>
                                                        </div>

                                                        <CardTitle className="text-base mt-2">Your Micro-Niche</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="text-sm leading-relaxed">{instant.microNiche}</CardContent>
                                                </Card>

                                                {/* CONFIDENCE PANEL */}
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
                                                        <CardContent className="text-sm leading-relaxed">{instant.coreProblem}</CardContent>
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
                                                            {(instant?.buyerPlaces ?? []).map((p, i) => (
                                                                <li key={i}>{p}</li>
                                                            ))}
                                                        </ul>
                                                    </CardContent>
                                                </Card>

                                                <Card className="rounded-2xl">
                                                    <CardHeader>
                                                        <CardTitle className="text-base">One Action Today</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="text-sm">{instant.oneActionToday}</CardContent>
                                                </Card>

                                                {/* Upgrade / Deep Proof */}
                                                <Card className="rounded-2xl border-dashed">
                                                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                                                        <div>
                                                            <CardTitle className="text-base">Want the proof?</CardTitle>
                                                            <p className="text-sm text-muted-foreground">Deep Proof explains why it works and how to expand safely.</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {paidUnlocked ? (
                                                                <Badge variant="secondary" className="rounded-full flex items-center gap-1">
                                                                    <Unlock className="h-3 w-3" /> Unlocked
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="rounded-full flex items-center gap-1">
                                                                    <Lock className="h-3 w-3" /> Locked
                                                                </Badge>
                                                            )}
                                                            {paidUnlocked && unlockUntil && secondsLeft > 0 && (
                                                                <Badge variant="outline" className="rounded-full">
                                                                    Time left: {mmssLeft}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </CardHeader>

                                                    <CardContent className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                                        <div className="text-sm text-muted-foreground">$27 one-time (Stripe Checkout)</div>

                                                        {!paidUnlocked ? (
                                                            <Button className="rounded-2xl" onClick={onUnlockDeep} disabled={!instant || isUnlocking}>
                                                                {isUnlocking ? "Opening checkout…" : "Unlock Deep Proof"}
                                                            </Button>
                                                        ) : (
                                                            <Button className="rounded-2xl" onClick={onGenerateDeep} disabled={!instant || isDeepLoading}>
                                                                {isDeepLoading ? "Generating Deep Proof…" : "Generate Deep Proof"}
                                                            </Button>
                                                        )}
                                                    </CardContent>
                                                </Card>

                                                <AnimatePresence mode="wait">
                                                    {mode === "deep" && !paidUnlocked && (
                                                        <motion.div
                                                            key="deephint"
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -10 }}
                                                            className="rounded-2xl border p-4 text-sm text-muted-foreground"
                                                        >
                                                            You selected <span className="font-medium">Deep Proof</span>. Click{" "}
                                                            <span className="font-medium">Unlock Deep Proof</span> to pay and unlock.
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                <AnimatePresence mode="wait">
                                                    {deep && (
                                                        <motion.div
                                                            key="deep"
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -10 }}
                                                            className="space-y-4"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Badge className="rounded-full">Deep Proof</Badge>
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
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </TabsContent>

                                {/* BUILDER / QA VIEW */}
                                <TabsContent value="builder">
                                    <AnimatePresence mode="wait">
                                        {!instant ? (
                                            <motion.div
                                                key="emptyB"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="rounded-2xl border p-6"
                                            >
                                                <p className="text-sm text-muted-foreground">
                                                    Builder/QA view will show structured metadata after you generate a result.
                                                </p>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="meta"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="space-y-4"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="text-sm font-medium">Quality / Confidence</div>
                                                        <div className="text-sm text-muted-foreground">{confidenceLabel}</div>
                                                    </div>
                                                    <Badge variant="outline" className="rounded-full">
                                                        Conservative mode
                                                    </Badge>
                                                </div>

                                                <Card className="rounded-2xl">
                                                    <CardHeader>
                                                        <CardTitle className="text-base">Gates passed</CardTitle>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(instant?.meta?.gatesPassed ?? []).map((g: string, i: number) => (
                                                                <Badge key={i} variant="secondary" className="rounded-full">
                                                                    {g}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </CardContent>
                                                </Card>

                                                <Card className="rounded-2xl">
                                                    <CardHeader>
                                                        <CardTitle className="text-base">Payments</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                                                        <div>Stripe session stored: {localStorage.getItem(LS_SESSION_KEY) ? "Yes" : "No"}</div>
                                                        <div>Unlocked (verified): {paidUnlocked ? "Yes" : "No"}</div>
                                                        <div>Countdown: {paidUnlocked && unlockUntil && secondsLeft > 0 ? mmssLeft : "—"}</div>
                                                        <div>Deep Proof route still enforces a server-side 402 if unpaid.</div>
                                                    </CardContent>
                                                </Card>

                                                <Card className="rounded-2xl">
                                                    <CardHeader>
                                                        <CardTitle className="text-base">Session state</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                                                        <div>History count: {history.length}</div>
                                                        <div>Saved count: {saved.length}</div>
                                                        <div>Avoid repeats: {avoidRepeats ? "On" : "Off"}</div>
                                                    </CardContent>
                                                </Card>

                                                <Card className="rounded-2xl">
                                                    <CardHeader>
                                                        <CardTitle className="text-base">Notes / constraints used</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="space-y-2">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                            <div className="rounded-2xl border p-3">
                                                                <div className="text-xs text-muted-foreground">Lane</div>
                                                                <div className="text-sm font-medium">{lanes.find((l) => l.id === laneId)?.label}</div>
                                                            </div>
                                                            <div className="rounded-2xl border p-3">
                                                                <div className="text-xs text-muted-foreground">Time</div>
                                                                <div className="text-sm font-medium">{timeOptions.find((t) => t.id === timeId)?.label}</div>
                                                            </div>
                                                            <div className="rounded-2xl border p-3">
                                                                <div className="text-xs text-muted-foreground">Level</div>
                                                                <div className="text-sm font-medium">{levelOptions.find((t) => t.id === levelId)?.label}</div>
                                                            </div>
                                                        </div>
                                                        <div className="rounded-2xl border p-3">
                                                            <div className="text-xs text-muted-foreground">Optional note</div>
                                                            <div className="text-sm">{notes ? notes : <span className="text-muted-foreground">(none)</span>}</div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                <footer className="mt-10 text-xs text-muted-foreground">
                    Tip: History/Saved now persist to localStorage so Stripe redirects don’t wipe the page state.
                </footer>
            </div>
        </div>
    );
}
