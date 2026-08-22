import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function roleBadgeVariant(role: string): BadgeVariant {
  switch (role) {
    case "admin":
      return "danger";
    case "artist":
      return "info";
    case "studio":
      return "warning";
    default:
      return "default";
  }
}

export function bookingStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "confirmed":
      return "success";
    case "accepted":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    case "requested":
      return "warning";
    default:
      return "default";
  }
}

export function paymentStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "paid":
      return "success";
    case "failed":
      return "danger";
    case "refunded":
      return "warning";
    default:
      return "default";
  }
}

export function quotationStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "paid":
      return "success";
    case "expired":
      return "danger";
    case "superseded":
      return "warning";
    default:
      return "default";
  }
}
