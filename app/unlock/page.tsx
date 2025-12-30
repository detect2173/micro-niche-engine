// app/unlock/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type VerifyOk = {
    ok: true;
    paid: boolean;
    status: string | null;
    payment_status: string | null;
};

type VerifyErr = {
    ok: false;
    reason: string;
};

type VerifyResponse = VerifyOk | VerifyErr;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function UnlockPage() {
    const router = useRouter();
    const sp = useSearchParams();

    const sessionId = useMemo(() => (sp.get("session_id") ?? "").trim(), [sp]);

    const [state, setState] = useState<
        "idle" | "verifying" | "paid" | "unpaid" | "error"
    >("idle");
    const [msg, setMsg] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        async function verify() {
            if (!sessionId) {
                setState("error");
                setMsg("Missing Stripe session_id.");
                return;
            }

            setState("verifying");
            setMsg("Verifying payment…");

            try {
                const res = await fetch(
                    `/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`,
                    { method: "GET", cache: "no-store" }
                );

                const data = (await res.json().catch(() => null)) as
                    | VerifyResponse
                    | null;

                if (!res.ok || !data) {
                    throw new Error(`Verify failed (${res.status}).`);
                }

                if (!data.ok) {
                    throw new Error(data.reason || "Verify failed.");
                }

                if (cancelled) return;

                if (data.paid) {
                    setState("paid");
                    setMsg("Payment confirmed. Redirecting…");

                    // ✅ Redirect to homepage (no /prototype)
                    router.replace(
                        `/?paid=1&session_id=${encodeURIComponent(sessionId)}`
                    );
                    return;
                }

                setState("unpaid");
                setMsg(
                    `Payment not confirmed yet. (status=${data.status ?? "unknown"}, payment_status=${
                        data.payment_status ?? "unknown"
                    })`
                );
            } catch (e: unknown) {
                if (cancelled) return;
                const emsg = e instanceof Error ? e.message : String(e);
                setState("error");
                setMsg(emsg || "Verification error.");
            }
        }

        verify();
        return () => {
            cancelled = true;
        };
    }, [router, sessionId]);

    return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
                Unlocking…
            </h1>

            <p style={{ marginBottom: 14 }}>
                {state === "verifying" && "Checking with Stripe."}
                {state === "paid" && "Confirmed. Redirecting you now."}
                {state === "unpaid" && "Not paid yet."}
                {state === "error" && "Could not unlock."}
                {state === "idle" && "Starting…"}
            </p>

            <div
                style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 16,
                    background: "#fafafa",
                }}
            >
                <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 }}>
                    <div>
                        <strong>session_id:</strong> {sessionId || "(missing)"}
                    </div>
                    <div>
                        <strong>state:</strong> {state}
                    </div>
                </div>

                {msg ? <p style={{ marginTop: 12, marginBottom: 0 }}>{msg}</p> : null}
            </div>

            {(state === "error" || state === "unpaid") && (
                <p style={{ marginTop: 16 }}>
                    <Link href="/" style={{ textDecoration: "underline" }}>
                        Back to home
                    </Link>
                </p>
            )}
        </main>
    );
}
