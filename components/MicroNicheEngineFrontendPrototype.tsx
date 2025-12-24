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
} from "lucide-react";
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

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

function keyForInstant(x: any) {
    const lane = String(x?.meta?.lane ?? x?.lane ?? "Lane").trim();
    const micro = String(
        x?.microNiche ??
        x?.micro_niche ??
        x?.name ?? // <-- your current API objects use "name"
        "Unknown"
    ).trim();
    return `${lane}::${micro}`;
}


const LS_SESSION_KEY = "mne_session_id";
const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

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

    // Session lists
    const [history, setHistory] = useState<InstantProof[]>([]);
    const [saved, setSaved] = useState<InstantProof[]>([]);
    const [avoidRepeats, setAvoidRepeats] = useState(true);
    const deepSectionRef = React.useRef<HTMLDivElement | null>(null);


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
        setPaidUnlocked(false);
        setPerspective("user");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearSession = () => {
        setHistory([]);
        setSaved([]);
    };

    // --- Stripe session capture + verify ---
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

        // Verify paid (server-side with Stripe secret)
        (async () => {
            try {
                const r = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`);
                const j = await r.json();
                setPaidUnlocked(!!j?.paid);
            } catch {
                // If verification fails, keep locked. Deep route will still enforce 402.
                setPaidUnlocked(false);
            }
        })();
    }, []);
    useEffect(() => {
        if (!DEV_MODE) setPerspective("user");
    }, []);

    const onGenerate = async () => {
        setIsGenerating(true);
        setDeep(null);
        setPaidUnlocked(false);

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
            // If user selected Full Validation, guide them to the next step after Instant is shown
            if (mode === "deep") {
                setTimeout(() => {
                    deepSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 150);
            }


            // If we have a valid paid session already, keep it unlocked
            const sessionId = localStorage.getItem(LS_SESSION_KEY);
            if (sessionId) {
                try {
                    const vr = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`);
                    const vj = await vr.json();
                    setPaidUnlocked(!!vj?.paid);
                } catch {
                    setPaidUnlocked(false);
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
            alert("No Stripe session found. Click Unlock Deep Proof first.");
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

            const j = await r.json().catch(() => ({}));
            if (r.status === 402) {
                setPaidUnlocked(false);
                alert("Deep Proof is locked. Payment not verified for this session.");
                return;
            }
            if (!r.ok) throw new Error(j?.error || `Deep Proof failed: ${r.status}`);

            setDeep(j as DeepProof);
            setPaidUnlocked(true);
        } catch (e: any) {
            alert(`Deep Proof failed: ${e?.message ?? "Unknown error"}`);
        } finally {
            setIsDeepLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-4 py-10">
                <header className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        {DEV_MODE && (
                            <Badge variant="secondary" className="rounded-full">
                                Prototype
                            </Badge>
                        )}
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
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant={mode === "instant" ? "default" : "outline"}
                                        className="rounded-2xl justify-start"
                                        onClick={() => setMode("instant")}
                                    >
                                        <Sparkles className="h-4 w-4 mr-2" /> Free Instant Result
                                    </Button>
                                    <Button
                                        variant={mode === "deep" ? "default" : "outline"}
                                        className="rounded-2xl justify-start"
                                        onClick={() => setMode("deep")}
                                    >
                                        <ShieldCheck className="h-4 w-4 mr-2" /> Full Validation
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    You’ll see the instant result first. Validation is an optional upgrade.
                                </p>

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
                                    <Label className="flex items-center gap-2">
                                        Avoid showing the same idea twice
                                    </Label>
                                    <p className="text-xs text-muted-foreground">Helps keep results fresh while you explore.</p>

                                </div>
                                <Switch checked={avoidRepeats} onCheckedChange={setAvoidRepeats} />
                            </div>

                            <Button className="w-full rounded-2xl" onClick={onGenerate} disabled={!userReady || isGenerating}>
                                {isGenerating ? "Finding your niche…" : "Find My Micro-Niche"}
                                <ChevronRight className="h-4 w-4 ml-2" />
                            </Button>

                            <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                    Session: <span className="font-medium">{history.length}</span> generated /{" "}
                                    <span className="font-medium">{saved.length}</span> saved
                                </div>
                                <Button
                                    variant="outline"
                                    className="rounded-2xl"
                                    onClick={clearSession}
                                    disabled={!history.length && !saved.length}
                                >
                                    Clear
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right: Preview + Panels */}
                    <Card className="rounded-2xl shadow-sm lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between gap-3">
                            <div>
                                <CardTitle className="text-lg">Your Result</CardTitle>
                                <p className="text-sm text-muted-foreground">A practical niche you could realistically monetize.</p>
                            </div>

                            {DEV_MODE ? (
                                <Tabs
                                    value={perspective}
                                    onValueChange={(v) => setPerspective(v as "user" | "builder")}
                                    className="w-auto"
                                >
                                    <TabsList className="rounded-2xl">
                                        <TabsTrigger value="user" className="rounded-2xl">
                                            User
                                        </TabsTrigger>
                                        <TabsTrigger value="builder" className="rounded-2xl">
                                            Builder / QA
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            ) : null}

                        </CardHeader>

                        <CardContent>
                            {/* History/Saved panels */}
                            {DEV_MODE ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                                <Card className="rounded-2xl">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <History className="h-4 w-4" /> History (session)
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
                                                {history.length > 8 && (
                                                    <div className="text-xs text-muted-foreground">Showing 8 of {history.length}. </div>
                                                )}
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
                            ) : null}

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
                                                    <p className="text-sm text-muted-foreground">You’re one click away.</p>
                                                    <p className="text-base">
                                                        Choose an industry — or let us surprise you — then click <span className="font-medium">Find My Micro-Niche</span>.
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
                                                        <CardContent className="text-sm leading-relaxed">
                                                            {instant.coreProblem?.trim() ? instant.coreProblem : "No clear problem returned — click “Try another”."}
                                                        </CardContent>

                                                    </Card>

                                                    <Card className="rounded-2xl">
                                                        <CardHeader>
                                                            <CardTitle className="text-base">First Service to Offer</CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-2">
                                                            <div className="text-sm font-medium">{instant?.firstService?.name ?? "—"}
                                                            </div>
                                                            <div className="text-sm text-muted-foreground">{instant?.firstService?.outcome ?? "—"}
                                                            </div>
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

                                                {/* Upgrade / Deep Proof */}{/* Upgrade / Deep Proof */}
                                                <div ref={deepSectionRef}>
                                                    <Card className="rounded-2xl border-dashed">
                                                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                                                        <div>
                                                            <CardTitle className="text-base">Want the full validation?</CardTitle>
                                                            <p className="text-sm text-muted-foreground">
                                                                See the evidence, risks, and safer expansion paths before you commit.
                                                            </p>
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
                                                        </div>
                                                    </CardHeader>

                                                    <CardContent className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                                        <div className="text-sm text-muted-foreground">One-time unlock — $27</div>

                                                        {!paidUnlocked ? (
                                                            <Button className="rounded-2xl" onClick={onUnlockDeep} disabled={!instant || isUnlocking}>
                                                                {isUnlocking ? "Opening secure checkout…" : "Unlock Full Validation"}
                                                            </Button>
                                                        ) : (
                                                            <Button className="rounded-2xl" onClick={onGenerateDeep} disabled={!instant || isDeepLoading}>
                                                                {isDeepLoading ? "Running validation…" : "Run Full Validation"}
                                                            </Button>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                                </div>
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
                                                        Conservative scoring
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
                                                        <div>DValidation access is enforced securely on the server.
                                                        </div>
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

                {DEV_MODE ? (
                    <footer className="mt-10 text-xs text-muted-foreground">
                        Tip: History/Saved are session-only right now. Next step can be persisting them to localStorage.
                    </footer>
                ) : null}

            </div>
        </div>
    );
}
