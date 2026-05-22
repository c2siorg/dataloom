import type { ReactNode } from "react";

/**
 * Centered shell for the auth pages: a single focused, left-aligned column on
 * a plain white background — the app's "front door".
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
