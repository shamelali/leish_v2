"use client";

import { useState, useEffect } from "react";
import { getFeaturedProducts, getProductsByCategory } from "@/lib/products";
import { Product } from "@/lib/types";
import { resolveProductPriceAndReward } from "@/lib/payments/product-commission";
import { insertReferral } from "@/lib/supabase/queries";
import { useAirtable } from "@/lib/airtable";

export default function BeautyProductsPage() {
  const { trackEvent } = useAirtable();

  // Initialize products directly from featured products
  const [products, setProducts] = useState<Product[]>(getFeaturedProducts());
  const [category, setCategory] = useState<string | null>(null);

  // Declare checkReferralCode before useEffect
  const checkReferralCode = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("ref");
    if (code && code !== "REF-SHAMEL") {
      await insertReferral(code, "", null, "pending");
      trackEvent("referral_accepted", { referrer_code: code });
    }
  };

  useEffect(() => {
    checkReferralCode();
  }, []);

  const handleReferralShare = async (productId: string) => {
    const { price, rewardAmount, product } = resolveProductPriceAndReward({
      productId,
      referrerId: "current-user",
      refereeId: "current-user",
    });

    await insertReferral(
      "current-user",
      "",
      productId,
      "pending",
      rewardAmount
    );

    trackEvent("referral_shared", {
      product_id: productId,
      product_name: product.name,
      reward_amount: rewardAmount,
    });

    const code = `REF-current-user`;
    navigator.clipboard.writeText(code);

    alert(`Referral code copied: ${code}\nYour friend gets 15% off, you earn $${rewardAmount} reward!`);
  };

  const handleProductClick = (productId: string) => {
    trackEvent("product_view", { product_id: productId });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Beauty Product Discovery
          </h1>
          <p className="text-gray-600">
            Find clean, effective beauty products recommended by friends-of-friends
          </p>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            onClick={() => setCategory(null)}
            className={`
              px-4 py-2 rounded-full border ${
                !category ? "bg-primary-600 text-white" : "border-gray-300 text-gray-700"
              }
            `}
          >
            All Products
          </button>
          <button
            onClick={() => setCategory("skincare")}
            className={`
              px-4 py-2 rounded-full border ${
                category === "skincare" ? "bg-primary-600 text-white" : "border-gray-300 text-gray-700"
              }
            `}
          >
            Skincare
          </button>
          <button
            onClick={() => setCategory("makeup")}
            className={`
              px-4 py-2 rounded-full border ${
                category === "makeup" ? "bg-primary-600 text-white" : "border-gray-300 text-gray-700"
              }
            `}
          >
            Makeup
          </button>
          <button
            onClick={() => setCategory("haircare")}
            className={`
              px-4 py-2 rounded-full border ${
                category === "haircare" ? "bg-primary-600 text-white" : "border-gray-300 text-gray-700"
              }
            `}
          >
            Haircare
          </button>
        </div>

        <div className="mb-6 rounded-lg border bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                d="M9 4a1 1 0 01.293.724l7 7a1 1 0 01-1.414 1.414L15 10.707 8.293 15.995a1 1 0 01-1.414-1.414L3 7.5 4.707 3.293a1 1 0 011.414-1.414zM5 10a2 2 0 012-4h4a2 2 0 012 4v4a2 2 0 01-2 2H7a2 2 0 01-2-4v-4z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              className="flex-1 border-none outline-none text-sm text-gray-700"
            />
            <button className="bg-primary-600 text-white px-4 py-2 rounded-md text-sm hover:bg-primary-700">
              Go
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => {
            const filteredProducts =
              category ? getProductsByCategory(category) : getFeaturedProducts();
            const matchingProduct = filteredProducts.find((p) => p.id === product.id);

            return (
              <article
                key={product.id}
                className="border rounded-lg border-gray-200 overflow-hidden hover:shadow-lg hover:transition-shadow duration-300 group"
              >
                <a
                  href={`/product/${product.id}`}
                  className="w-full block transition-colors duration-200 group-hover:opacity-90"
                >
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-48 object-cover"
                    />
                  )}
                  {!(product.image_url || product.id.includes("placeholder")) && (
                    <div
                      className="w-full h-48 bg-gray-200 flex items-center justify-center text-gray-400 text-sm"
                    >
                      {product.name.substring(0, 10)}
                    </div>
                  )}
                </a>
                <div className="p-3">
                  <h3 className="font-medium text-sm line-clamp-2 text-gray-900">
                    {product.name}
                  </h3>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                    {product.description || ""}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-lg font-bold text-primary-600">
                      ${(product.price / 100).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span key={i} className="inline-flex items-center gap-0.5 text-sm">
                          ★
                        </span>
                      ))}
                      {product.review_count && (
                        <span className="text-xs text-gray-400">({product.review_count})</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleProductClick(product.id)}
                    className="mt-2 w-full py-2 rounded-md text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  >
                    Discover Product
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-8 p-6 bg-primary-50 rounded-lg border border-primary-200">
          <h2 className="text-xl font-bold text-primary-800 mb-4">
            Share & Earn with Friends-of-Friends
          </h2>
          <p className="text-gray-600 mb-4">
            Invite friends and earn rewards when they purchase beauty products!
          </p>

          <div className="bg-white p-4 rounded-md mb-4 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="referral-code-input"
                value="REF-SHAMEL"
                readOnly
                className="flex-1 border-none outline-none text-sm text-gray-700"
                aria-referral-code
              />
              <button
                onClick={() => navigator.clipboard.writeText("REF-SHAMEL")}
                className="bg-primary-600 text-white px-4 py-2 rounded-sm text-sm hover:bg-primary-700 transition-colors"
                aria-label="Copy referral code"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Share this code with friends. They get 15% off their first purchase,
              and you earn $10 reward per successful referral!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => shareToWhatsApp()}
              className="w-full py-2 rounded-md border border-primary-600 text-primary-600 text-sm hover:bg-primary-100 transition-colors"
              aria-label="Share to WhatsApp"
            >
              WhatsApp
            </button>
            <button
              onClick={() => shareToInstagram()}
              className="w-full py-2 rounded-md border border-primary-600 bg-primary-600 text-white text-sm hover:bg-primary-800 transition-colors"
              aria-label="Share to Instagram"
            >
              Instagram
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function shareToWhatsApp() {
  const text = `Check out this amazing beauty product discovery platform! ${window.location.origin}/beauty-products?ref=REF${Math.random().toString(36).substr(2, 8)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(whatsappUrl, "_blank");
}

function shareToInstagram() {
  const igUrl = `https://www.instagram.com/${encodeURIComponent(
    `Check out this beauty platform: ${window.location.origin}/beauty-products`
  )}`;
  window.open(igUrl, "_blank");
}