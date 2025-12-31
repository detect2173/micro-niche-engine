// app/unlock/unlock-client.tsx
"use client";

import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UnlockClient() {
    const router = useRouter();
    const sp = useSearchParams();

    useEffect(() => {
        const sessionId = (sp.get("session_id") ?? "").trim();
        const paid = (sp.get("paid") ?? "").trim() === "1";

        if (!sessionId) {
            router.replace("/?unlock=missing_session");
            return;
        }

        // Redirect back to the real homepage (no /prototype)
        router.replace(`/?paid=${paid ? "1" : "0"}&session_id=${encodeURIComponent(sessionId)}`);
    }, [router, sp]);

    return (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
            <h1 style={{ margin: 0 }}>Finalizing…</h1>
            <p style={{ marginTop: 12, marginBottom: 0 }}>
                Redirecting you back to the app.
            </p>
        </main>
    );
}
