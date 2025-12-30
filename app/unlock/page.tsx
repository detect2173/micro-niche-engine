// app/unlock/page.tsx
"use client";

import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UnlockPage() {
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
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
        Unlocking…
      </h1>
      <p>Redirecting you back to the app…</p>
    </main>
  );
}
