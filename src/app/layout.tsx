import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

/** CSP nonce set by middleware per-request; applied to script tags so script-src
 * can omit 'unsafe-inline'. Falls back to undefined in SSR edge cases. */
async function getCspNonce(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-nonce") ?? undefined;
  } catch {
    return undefined;
  }
}

async function getInitialTheme(): Promise<"light" | "dark"> {
  try {
    const cookieStore = await cookies();
    const theme = cookieStore.get("leish-theme")?.value;
    return theme === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my"),
  title: {
    default: "Leish! — Beauty Booking Marketplace",
    template: "%s — Leish!",
  },
  description:
    "Book beauty anywhere. Discover top-rated makeup artists and studios across Malaysia, check real-time availability, and book in minutes.",
  keywords: ["makeup artist Malaysia", "bridal makeup", "beauty studio", "book makeup artist KL"],
  openGraph: {
    type: "website",
    locale: "en_MY",
    siteName: "Leish!",
    title: "Leish! — Beauty Booking Marketplace",
    description: "Book beauty anywhere. Discover top-rated makeup artists across Malaysia.",
    images: [
      {
        url: "/images/leish-light.jpeg",
        width: 1024,
        height: 1280,
        alt: "Makeup artist perfecting a client's look",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Leish! — Beauty Booking Marketplace",
    description: "Book beauty anywhere. Discover top-rated makeup artists across Malaysia.",
    images: ["/images/hero.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#be123c" },
    { media: "(prefers-color-scheme: dark)", color: "#881337" },
  ],
};

const themeScript = `
(function () {
  try {
    var t = "dark";
    var match = document.cookie.match(/leish-theme=([^;]+)/);
    if (match) t = match[1];
    if (t === "light") t = "light";
    if (t === "dark") document.documentElement.classList.add("dark");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = await getCspNonce();
  const initialTheme = await getInitialTheme();

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-stone-50 font-sans text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        {/* Theme bootstrap — nonce'd so script-src can omit 'unsafe-inline'. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />

        <ThemeProvider initialTheme={initialTheme}>
          <AuthProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
