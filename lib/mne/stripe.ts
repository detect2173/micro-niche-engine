// lib/mne/stripe.ts
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");

export const stripe = new Stripe(secretKey, {

});

export async function createDeepProofCheckoutSession() {
  const price = process.env.STRIPE_PRICE_DEEP_PROOF;
  if (!price) throw new Error("Missing STRIPE_PRICE_DEEP_PROOF");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const successUrl = `${appUrl}/prototype?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/prototype?canceled=1`;

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

  // Stripe: payment_status is "paid" when complete
  if (session.payment_status !== "paid") {
    const err = new Error("Payment not completed");
    (err as any).statusCode = 402;
    throw err;
  }

  // Optional: ensure this session is for your Deep Proof product
  if (session.metadata?.product !== "deep_proof") {
    const err = new Error("Invalid purchase");
    (err as any).statusCode = 403;
    throw err;
  }

  return session;
}
