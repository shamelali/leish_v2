/**
 * Resolves product price and referral reward SERVER-SIDE.
 * Never accept price or rewardAmount from client input — this
 * closes the client-tampering vector that was audited and fixed in v1
 * (booking amount/depositAmount could otherwise be spoofed by the client).
 *
 * Call this from the server action / route handler that processes a referral
 * or product purchase, using values already fetched from `products` table
 * via a trusted (service-role or already-scoped) Supabase query — not from
 * the request body.
 */
import { BEAUTY_PRODUCTS } from "../products";

export function resolveProductPriceAndReward(params: {
  productId: string;
  referrerId: string;
  refereeId: string;
}) {
  const product = BEAUTY_PRODUCTS.find((p) => p.id === params.productId);

  if (!product) {
    throw new Error(`[products] Product not found: ${params.productId}`);
  }

  const price = product.price;
  // Referral reward: 10% of product price, minimum $5, maximum $20
  const rewardPercent = 10;
  const rewardAmount = Math.max(
    MIN_REWARD * 100, // minimum $5 in cents
    MAX_REWARD * 100, // maximum $20 in cents
      Math.round((price * rewardPercent) / 100)
    )
  );

  return {
    price,
    rewardAmount,
    product,
  };
}

/**
 * Commission constants for product referrals
 */
export const PRODUCT_COMMISSION_PERCENT = 10;
export const MIN_REWARD_AMOUNT = 5; // minimum $5 reward
export const MAX_REWARD_AMOUNT = 20; // maximum $20 reward

