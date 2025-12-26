// lib/mne/stripe.ts
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");

export const stripe: Stripe = new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover",
});

export class HttpError extends Error {
    public readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}

export async function createDeepProofCheckoutSession() {
    const price = process.env.STRIPE_PRICE_DEEP_PROOF;
    if (!price) throw new Error("Missing STRIPE_PRICE_DEEP_PROOF");

    const appUrl: string = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

    const successUrl = `${appUrl}/?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/?canceled=1`;


    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { product: "deep_proof" },
    });

    return session;
}

export async function assertPaidSession(sessionId: string) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
        throw new HttpError("Payment not completed", 402);
    }

    if (session.metadata?.product !== "deep_proof") {
        throw new HttpError("Invalid purchase", 403);
    }

    return session;
}
