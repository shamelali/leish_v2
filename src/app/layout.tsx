import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "Leish! — Beauty Booking Marketplace",
    template: "%s — Leish!",
  },
  description:
    "Book beauty anywhere. Discover top-rated makeup artists and studios across Malaysia, check real-time availability, and book in minutes.",
  keywords: ["makeup artist Malaysia", "bridal makeup", "beauty studio", "book makeup artist KL"],
};

const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("leish-theme") || "dark";
    if (t === "dark") document.documentElement.classList.add("dark");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-stone-50 font-sans text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
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
