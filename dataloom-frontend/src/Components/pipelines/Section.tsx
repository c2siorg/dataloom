import type { ReactNode } from "react";

/** A numbered "—— Step N —— Title ——" divider that opens each part of the form. */
function SectionHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-surface">
        {n}
      </span>
      <div className="shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span className="ml-2 h-px flex-1 bg-app-border" />
    </div>
  );
}

/** A form section: the numbered divider header plus its indented body. */
export function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SectionHeader n={n} title={title} hint={hint} />
      <div className="pl-10">{children}</div>
    </section>
  );
}
