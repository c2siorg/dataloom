import type { ReactNode } from "react";

export type EmptyStateVariant = "card" | "inline";

interface EmptyStateProps {
  /** Primary message. */
  title: string;
  /** Supporting line below the title. */
  description?: string;
  /** Call to action, typically a button. Not rendered by the inline variant. */
  action?: ReactNode;
  /** Glyph shown above the title. Not rendered by the inline variant. */
  icon?: ReactNode;
  /** `card` for a standalone region, `inline` for a table cell. */
  variant?: EmptyStateVariant;
}

/**
 * Placeholder for regions with nothing to show.
 */
export default function EmptyState({
  title,
  description,
  action,
  icon,
  variant = "card",
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div
        className="py-4 px-4 text-center text-sm text-muted-foreground"
        data-testid={`empty-state-${variant}`}
      >
        {title}
        {description && <p className="mt-1">{description}</p>}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-6 rounded-xl border-2 border-dashed border-app-border bg-surface text-center"
      data-testid={`empty-state-${variant}`}
    >
      {icon && (
        <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-blue-50">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-6 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
