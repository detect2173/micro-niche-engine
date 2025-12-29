// components/QuickStart15.tsx
"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
    microNiche?: string | null;
    coreProblem?: string | null;
    serviceName?: string | null;
    serviceOutcome?: string | null;
    buyerPlaces?: string[] | null;
};

function firstNonEmpty(arr?: (string | null | undefined)[] | null) {
    return (arr ?? []).find((x) => typeof x === "string" && x.trim().length > 0)?.trim() ?? "";
}

function clean(s?: string | null) {
    return (s ?? "").trim();
}

export default function QuickStart15({
                                         microNiche,
                                         coreProblem,
                                         serviceName,
                                         serviceOutcome,
                                         buyerPlaces,
                                     }: Props) {
    const steps = useMemo(() => {
        const niche = clean(microNiche);
        const problem = clean(coreProblem);
        const svc = clean(serviceName);
        const outcome = clean(serviceOutcome);

        const place = firstNonEmpty(buyerPlaces);
        const placeHint = place ? ` in ${place}` : "";

        const bullets: string[] = [];

        // 1) Offer sentence (ties niche + service + outcome)
        if (niche && svc) {
            bullets.push(
                `Write a 1-sentence offer: “I help ${niche} by delivering ${svc}${outcome ? ` (${outcome})` : ""}.”`
            );
        } else if (niche) {
            bullets.push(`Write a 1-sentence offer for ${niche}: who you help + the outcome you deliver.`);
        } else {
            bullets.push(`Write a 1-sentence offer: who you help + what result you deliver.`);
        }

        // 2) Tiny target list where buyers already are
        if (place) {
            bullets.push(`Open${placeHint} and list 10 potential buyers (copy/paste names + links).`);
        } else {
            bullets.push(`List 10 potential buyers (Google + a directory + one social platform).`);
        }

        // 3) Micro outreach message (low effort, high signal)
        if (svc) {
            bullets.push(
                `Draft a 2-sentence message: 1) mention the likely problem${problem ? ` (“${problem}”)` : ""}, 2) offer ${svc} with a tiny, low-risk next step.`
            );
        } else {
            bullets.push(
                `Draft a 2-sentence message: 1) name the likely problem, 2) offer a low-risk next step (sample / audit / quick setup).`
            );
        }

        // 4) Send 3, look for a response signal
        bullets.push(`Send it to 3 people. Success signal: at least 1 reply asking a question or requesting details.`);

        return bullets.slice(0, 4);
    }, [microNiche, coreProblem, serviceName, serviceOutcome, buyerPlaces]);

    return (
        <Card className="rounded-2xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    If you had 15 minutes…
                    <Badge variant="secondary" className="rounded-full">
                        QuickStart
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                <ul className="list-disc pl-5 space-y-2">
                    {steps.map((s, i) => (
                        <li key={i}>{s}</li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}
