// app/unlock/page.tsx
import { redirect } from "next/navigation";

type SearchParams = {
    paid?: string;
    session_id?: string;
};

export default function UnlockPage({
                                       searchParams,
                                   }: {
    searchParams?: SearchParams;
}) {
    const sessionId = searchParams?.session_id ?? "";
    const paid = searchParams?.paid === "1";

    if (!sessionId) {
        redirect("/?unlock=missing_session");
    }

    redirect(
        `/?paid=${paid ? "1" : "0"}&session_id=${encodeURIComponent(sessionId)}`
    );
}
