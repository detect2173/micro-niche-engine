// app/unlock/page.tsx
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string {
    if (!v) return "";
    return Array.isArray(v) ? (v[0] ?? "") : v;
}

export default async function UnlockPage(props: {
    searchParams?: Promise<SP>;
}) {
    const sp = (await props.searchParams) ?? {};

    const sessionId = firstParam(sp.session_id).trim();
    const paid = firstParam(sp.paid).trim() === "1";

    if (!sessionId) {
        redirect("/?unlock=missing_session");
    }

    // Always funnel back to the canonical app route:
    redirect(`/?paid=${paid ? "1" : "0"}&session_id=${encodeURIComponent(sessionId)}`);
}
