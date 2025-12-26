// components/QuickStart15.tsx
"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
    microNiche?: string | null;
    coreProblem?: string | null;
    serviceName?: string | null;
    serviceOutcome?: string | null;
    buyerPlaces?: string[] | null;
};

function firstNonEmpty(arr?: string[] | null) {
    return (arr ?? []).map((x) => (x ?? "").trim()).find(Boolean) ?? "";
}

export default function QuickStart15(props: Props) {
    const steps = useMemo(() => {
        const niche = (props.microNiche ?? "").trim();
        const problem = (props.coreProblem ?? "").trim();
        const svc = (props.serviceName ?? "").trim();
        const outcome = (props.serviceOutcome ?? "").trim();
        const place = firstNonEmpty(props.buyerPlaces);

        // If we have weak data, fall back to still-actionable steps
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
    }, [
        props.microNiche,
        props.coreProblem,
        props.serviceName,
        props.serviceOutcome,
        props.buyerPlaces,
    ]);

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
