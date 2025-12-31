// app/unlock/unlock-client.tsx
"use client";

import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UnlockClient() {
    const router = useRouter();
    const sp = useSearchParams();

    const sessionId = (sp.get("session_id") ?? "").trim();
    const paid = (sp.get("paid") ?? "").trim() === "1";

    useEffect(() => {
        if (!sessionId) {
            router.replace("/?unlock=missing_session");
            return;
        }

        router.replace(
            `/?paid=${paid ? "1" : "0"}&session_id=${encodeURIComponent(sessionId)}`
        );
    }, [router, sessionId, paid]);

    return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>Finalizing…</h1>
            <p style={{ marginTop: 0, opacity: 0.85 }}>
                If you’re not redirected in a moment, go back to{" "}
                <a href="/" style={{ textDecoration: "underline" }}>
                    the homepage
                </a>
                .
            </p>
        </main>
    );
}
