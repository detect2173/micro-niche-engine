// lib/mne/stripe.ts
import Stripe from "stripe";

/**
 * IMPORTANT:
 * - Do NOT read STRIPE_SECRET_KEY at module load time.
 * - Next.js / OpenNext / CI may evaluate modules during build ("collect page data").
 * - Therefore: expose a getter that reads env vars lazily at runtime.
 *
 * This avoids CI failures like: "Missing STRIPE_SECRET_KEY" during next build.
 */

declare global {
    // eslint-disable-next-line no-var
    var __mneStripe: Stripe | undefined;
}

export function getStripe(): Stripe {
    // Reuse a singleton across hot reloads / requests where possible
    if (globalThis.__mneStripe) return globalThis.__mneStripe;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error("Missing STRIPE_SECRET_KEY");
    }

    // NOTE: apiVersion typing differs by stripe package versions.
    // Keeping it simple and compatible:
    const stripe = new Stripe(key, {
        // If your installed Stripe version requires apiVersion, set it here:
        // apiVersion: "2024-06-20",
        // Otherwise you can omit apiVersion entirely.
    });

    globalThis.__mneStripe = stripe;
    return stripe;
}
