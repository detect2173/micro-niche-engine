// app/unlock/page.tsx
import React from "react";
import UnlockClient from "./unlock-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

export default function UnlockPage({
                                     searchParams,
                                   }: {
  searchParams?: SearchParams;
}) {
  const sessionId = firstParam(searchParams?.session_id).trim();
  const paid = firstParam(searchParams?.paid).trim() === "1";

  return <UnlockClient sessionId={sessionId} paid={paid} />;
}
