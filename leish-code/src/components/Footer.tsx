import { Logo } from "./Logo";

const footerLinks = [
  {
    title: "Explore",
    links: [
      { label: "Find Artists", href: "/artists" },
      { label: "Browse Studios", href: "/studios" },
      { label: "Join as Artist", href: "/onboarding" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Leish!", href: "/" },
      { label: "How It Works", href: "/#how-it-works" },
      { label: "Contact", href: "/" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Centre", href: "/" },
      { label: "Terms of Service", href: "/" },
      { label: "Privacy Policy", href: "/" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm leading-6 text-stone-500 dark:text-stone-400">
              Book beauty anywhere. Malaysia&apos;s marketplace for makeup artists and beauty
              studios.
            </p>
            <p className="mt-4 text-xs text-stone-400 dark:text-stone-500">
              Cyberjaya · Selangor · Malaysia
            </p>
          </div>
          {footerLinks.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {col.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-stone-500 transition-colors hover:text-rose-600 dark:text-stone-400 dark:hover:text-rose-400"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-stone-100 pt-6 text-xs text-stone-400 sm:flex-row dark:border-stone-800 dark:text-stone-500">
          <p>
            © {new Date().getFullYear()} Leish! · Demo build for leish.my v2. All data is sample
            content.
          </p>
          <p>Made with ♥ in Malaysia</p>
        </div>
      </div>
    </footer>
  );
}
