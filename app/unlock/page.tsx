// app/unlock/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type VerifyResponse = {
    ok?: boolean;
    paid?: boolean;
    deepPaid?: boolean;
    error?: string;
};

export default function UnlockPage() {
    const router = useRouter();
    const sp = useSearchParams();

    const sessionId = useMemo(() => sp.get("session_id") ?? "", [sp]);
    const paid = useMemo(() => sp.get("paid") === "1", [sp]);

    const [status, setStatus] = useState<"idle" | "verifying" | "ok" | "error">(
        "idle"
    );
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!sessionId) {
                setStatus("error");
                setMessage("Missing Stripe session_id.");
                return;
            }

            setStatus("verifying");
            setMessage("Verifying payment…");

            try {
                // Prefer your existing verify endpoint if you have one.
                // If your endpoint path differs, update it here.
                const res = await fetch(
                    `/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`,
                    { method: "GET" }
                );

                const data = (await res.json().catch(() => ({}))) as VerifyResponse;

                if (!res.ok || data?.ok === false) {
                    throw new Error(data?.error || `Verify failed (${res.status})`);
                }

                // If your backend uses a different flag name, adjust here.
                const isPaid = Boolean(data?.paid ?? data?.deepPaid ?? paid);

                if (!isPaid) {
                    throw new Error("Payment not confirmed yet.");
                }

                if (cancelled) return;

                setStatus("ok");
                setMessage("Payment confirmed. Redirecting…");

                // ✅ Clean redirect to homepage (your “real” app)
                // Preserve paid/session_id if your homepage logic needs it.
                router.replace(`/?paid=1&session_id=${encodeURIComponent(sessionId)}`);
            } catch (e: unknown) {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : String(e);
                setStatus("error");
                setMessage(msg || "Verification failed.");
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [router, sessionId, paid]);

    return (
        <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                Unlocking…
            </h1>

            <p style={{ marginBottom: 16 }}>
                {status === "verifying" && "Verifying your payment with Stripe."}
                {status === "ok" && "Payment confirmed. Redirecting you now."}
                {status === "error" && "We couldn’t confirm your payment."}
                {status === "idle" && "Starting…"}
            </p>

            <div
                style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    background: "#fafafa",
                }}
            >
                <div style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>
                        <strong>session_id:</strong> {sessionId || "(missing)"}
                    </div>
                    <div>
                        <strong>status:</strong> {status}
                    </div>
                </div>

                {message ? (
                    <p style={{ marginTop: 12, marginBottom: 0 }}>{message}</p>
                ) : null}
            </div>

            {status === "error" ? (
                <p style={{ marginTop: 16 }}>
                    <a href="/" style={{ textDecoration: "underline" }}>
                        Back to home
                    </a>
                </p>
            ) : null}
        </main>
    );
}
