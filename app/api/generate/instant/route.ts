import { cacheGetOrSet } from "@/lib/mne/cache";
import { sha256Hex } from "@/lib/mne/hash";

// ...inside POST:
const rawKey = JSON.stringify({ lane, notes, level, avoidMicroNiches });
const key = `instant:${await sha256Hex(rawKey)}`;

const result = await cacheGetOrSet(key, 60 * 60 * 6, async () => {
  // your existing OpenAI generation logic returning the JSON schema
});
