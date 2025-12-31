// app/unlock/page.tsx
import React, { Suspense } from "react";
import UnlockClient from "./unlock-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function UnlockPage() {
  // Must wrap any useSearchParams usage in Suspense (Next.js requirement)
  return (
      <Suspense fallback={<div style={{ padding: 24 }}>Redirecting…</div>}>
        <UnlockClient />
      </Suspense>
  );
}
