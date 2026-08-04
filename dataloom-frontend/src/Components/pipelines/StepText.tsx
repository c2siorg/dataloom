import { stepLabel, stepSummary } from "./pipelineStepText";

/** Ordinal badge with a connecting rail, marking a step's position in the run order. */
export function StepRail({ index, last }: { index: number; last: boolean }) {
  return (
    <div className="flex flex-col items-center self-stretch">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-app-border bg-surface text-xs font-medium text-muted-foreground">
        {index + 1}
      </span>
      {!last && <span className="mt-1 w-px flex-1 bg-app-border" />}
    </div>
  );
}

/** Label + parameter summary + optional source tag for one step. */
export function StepText({
  actionType,
  details,
  source,
}: {
  actionType: string;
  details: Record<string, unknown>;
  source?: "log" | "manual";
}) {
  const summary = stepSummary(actionType, details);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{stepLabel(actionType)}</span>
        {source && (
          <span className="rounded border border-app-border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
            {source}
          </span>
        )}
      </div>
      {summary && <p className="truncate text-xs text-muted-foreground">{summary}</p>}
    </div>
  );
}
