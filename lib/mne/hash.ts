// lib/mne/hash.ts
export async function sha256Hex(input: string): Promise<string> {
  // WebCrypto path (Workers + modern Node)
  const anyCrypto = globalThis.crypto as Crypto | undefined;
  if (anyCrypto?.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await anyCrypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Node fallback
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(input, "utf8").digest("hex");
}
