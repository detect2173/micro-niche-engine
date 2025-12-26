// app/api/stripe/verify-session/route.ts
import { NextResponse } from "next/server";
import { verifyDeepProofPass } from "@/app/api/stripe/pass";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id") ?? "";

    const status = await verifyDeepProofPass(sessionId);

    return NextResponse.json({
        paid: status.paid && status.ok,
        passExpiresAt: status.passExpiresAt,
        secondsRemaining: status.secondsRemaining,
    });
}
