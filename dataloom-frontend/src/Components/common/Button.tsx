import type { ButtonHTMLAttributes, ReactNode } from "react";

const VARIANT_CLASSES = {
  primary: "bg-accent text-white hover:bg-accent-hover focus:ring-accent",

  secondary:
    "border border-app-border bg-surface text-foreground hover:border-app-border-hover hover:bg-surface-hover focus:ring-app-border",

  danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-danger",

  ghost: "bg-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground",

  success: "bg-success text-white hover:bg-success-hover focus:ring-success",
};

const SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2",
};

export type ButtonVariant = keyof typeof VARIANT_CLASSES;
export type ButtonSize = keyof typeof SIZE_CLASSES;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant. */
  variant?: ButtonVariant;
  /** Button size. */
  size?: ButtonSize;
  children?: ReactNode;
  className?: string;
}

/**
 * Reusable button component with variant and size support.
 */
export default function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`rounded-md font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        SIZE_CLASSES[size] || SIZE_CLASSES.md
      } ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
