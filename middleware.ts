import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ✅ Default export (some runtimes/bundlers look for this)
export default function middleware(_req: NextRequest) {
  return NextResponse.next();
}

// ✅ Named export (Next supports this too)
export function middlewareNamed(_req: NextRequest) {
  return NextResponse.next();
}

// Note: Do NOT export `middleware` twice with the same name.
// Some tooling gets confused by re-exports. We give the named export a different name.

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
