import { Logo } from "./Logo";

const BUILD_YEAR = 2026;

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
      { label: "Help Centre", href: "/help" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Book beauty anywhere. Malaysia&apos;s marketplace for makeup artists and beauty
              studios.
            </p>
            <p className="mt-4 text-xs text-ink-subtle">Cyberjaya · Selangor · Malaysia</p>
          </div>
          {footerLinks.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-ink">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-ink-muted transition-colors duration-[var(--dur-fast)] hover:text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-xs text-ink-subtle sm:flex-row">
          <p>© {BUILD_YEAR} Leish! · Duta Integra Solutions.</p>
          <p>Made with ♥ in Malaysia</p>
        </div>
      </div>
    </footer>
  );
}
