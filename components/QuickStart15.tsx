// components/QuickStart15.tsx
"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
    /**
     * Preferred: pass precomputed steps from the parent (single source of truth).
     */
    steps?: (string | null | undefined)[] | null;
};

function normalizeSteps(arr?: (string | null | undefined)[] | null): string[] {
    return (arr ?? []).map((x) => (x ?? "").trim()).filter(Boolean);
}

const FALLBACK_STEPS: string[] = [
    "Write a 1-sentence offer with a clear outcome + timeframe (e.g., “I can improve X in 7 days”).",
    "Pick one channel where buyers already hang out (FB groups, LinkedIn, directories) and collect 10 targets.",
    "Send 5 short messages today: problem → outcome → one question. Track replies in a note.",
];

export default function QuickStart15(props: Props) {
    const steps = useMemo(() => {
        const s = normalizeSteps(props.steps);
        return s.length ? s : FALLBACK_STEPS;
    }, [props.steps]);

    return (
        <Card className="rounded-2xl">
            <CardHeader>
                <CardTitle className="text-base">If you had 15 minutes</CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-2">
                    {steps.map((s, i) => (
                        <li key={i}>{s}</li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
