import type { SVGProps } from "react";

/**
 * Consistent stroke-based icon set for the admin panel (24x24 viewBox).
 * All icons inherit `currentColor` and accept standard SVG props.
 */

function base(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
    className: props.className ?? "h-5 w-5 shrink-0",
  };
}

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

export function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 19.5c0-3.1 2.8-5.25 6.25-5.25s6.25 2.15 6.25 5.25" />
      <path d="M16.5 5.4a3.25 3.25 0 010 5.95" />
      <path d="M18.6 14.6c1.85.85 2.65 2.4 2.65 4.9" />
    </svg>
  );
}

export function IconPalette(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a9 9 0 100 18c1.5 0 2.25-.9 2.25-2 0-.65-.3-1.1-.3-1.75 0-1 .8-1.75 1.8-1.75H18a3.5 3.5 0 003.5-3.5C21.5 6.7 17.25 3 12 3z" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStore(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 10v9a1 1 0 001 1h14a1 1 0 001-1v-9" />
      <path d="M3.5 6.5L5 3.5h14l1.5 3c.4 1.2-.3 2.5-1.7 2.5-1.1 0-1.9-.8-1.9-1.8 0 1-.9 1.8-1.9 1.8s-1.9-.8-1.9-1.8c0 1-.9 1.8-1.9 1.8s-1.9-.8-1.9-1.8c0 1-.9 1.8-1.9 1.8-1.4 0-2.1-1.3-1.7-2.5z" />
      <path d="M9.5 20v-5a1 1 0 011-1h3a1 1 0 011 1v5" />
    </svg>
  );
}

export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
      <path d="M7.5 13.5h3M13.5 13.5h3M7.5 17h3" />
    </svg>
  );
}

export function IconCard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2.75" y="5.5" width="18.5" height="13" rx="2" />
      <path d="M2.75 10h18.5" />
      <path d="M6.5 14.5h4" />
    </svg>
  );
}

export function IconQuotation(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M6 2.75h8L19.25 8v11.25a2 2 0 01-2 2H6a2 2 0 01-2-2V4.75a2 2 0 012-2z" />
      <path d="M14 2.75V8h5.25" />
      <path d="M8 12.5h8M8 16h5.5" />
    </svg>
  );
}

export function IconMessage(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M20.5 11.5a7.5 7.5 0 01-7.5 7.5c-1.2 0-2.35-.25-3.35-.75L4.5 19.5l1.25-4.15A7.5 7.5 0 1120.5 11.5z" />
      <path d="M8.75 11.5h.01M12 11.5h.01M15.25 11.5h.01" strokeWidth="2.4" />
    </svg>
  );
}

export function IconMail(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2.75" y="5" width="18.5" height="14" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

export function IconAudit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 2.75l7.5 3v5.5c0 4.6-3.2 8-7.5 9.75-4.3-1.75-7.5-5.15-7.5-9.75v-5.5l7.5-3z" />
      <path d="M9 11.75l2.25 2.25L15.5 9.75" />
    </svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.98 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.98a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.63.28 1.1.87 1.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 8V5.75a2 2 0 00-2-2h-6.75a2 2 0 00-2 2v12.5a2 2 0 002 2h6.75a2 2 0 002-2V16" />
      <path d="M9.5 12h11M17.5 9l3 3-3 3" />
    </svg>
  );
}

export function IconCollapse(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
      <path d="M16.5 9.5L14 12l2.5 2.5" />
    </svg>
  );
}

export function IconExpand(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9.5 4v16" />
      <path d="M14 9.5l2.5 2.5-2.5 2.5" />
    </svg>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconGlobe(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9.25" />
      <path d="M2.75 12h18.5" />
      <path d="M12 2.75c2.5 2.3 3.9 5.55 3.9 9.25S14.5 18.95 12 21.25c-2.5-2.3-3.9-5.55-3.9-9.25S9.5 5.05 12 2.75z" />
    </svg>
  );
}
