// lib/mne/hash.ts
import { createHash } from "crypto";

export async function sha256Hex(input: string): Promise<string> {
    // Prefer WebCrypto if available (Edge/runtime environments)
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        const enc = new TextEncoder();
        const buf = await subtle.digest("SHA-256", enc.encode(input));
        return Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    // Node fallback
    return createHash("sha256").update(input).digest("hex");
}
