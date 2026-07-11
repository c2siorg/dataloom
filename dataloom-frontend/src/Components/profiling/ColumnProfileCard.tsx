import type { ColumnProfile } from "../../api/profiling";
import DtypeBadge from "../common/DtypeBadge";

interface ColumnProfileCardProps {
  profile: ColumnProfile | null;
  loading: boolean;
}

/** Round to at most 2 decimals and drop trailing zeros; null → "—". */
function fmtNum(value: number | null): string {
  if (value == null) return "—";
  return Number(value.toFixed(2)).toLocaleString();
}

/** Render a value as a 0–100 percentage; null → "—". */
function fmtPct(value: number | null): string {
  if (value == null) return "—";
  return `${Number(value.toFixed(1))}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium truncate" title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * Compact, type-aware stats card sized to sit inside a column-width header cell.
 * The common block (dtype, missing, unique, distribution) always renders; the
 * type-specific block is chosen from the populated profile fields.
 */
export default function ColumnProfileCard({ profile, loading }: ColumnProfileCardProps) {
  if (loading) {
    return (
      <div className="p-1.5 space-y-1 animate-pulse" data-testid="column-profile-skeleton">
        <div className="h-2 bg-surface rounded" />
        <div className="h-2 bg-surface-hover rounded w-3/4" />
        <div className="h-2 bg-surface-hover rounded w-1/2" />
      </div>
    );
  }

  // Loading finished but no profile (e.g. the column's fetch failed) — stay empty.
  if (!profile) return null;

  return (
    <div
      data-testid="column-profile-card"
      className="p-1.5 space-y-0.5 text-[10px] leading-tight normal-case font-normal tracking-normal"
    >
      <div className="flex items-center justify-between gap-1">
        <DtypeBadge dtype={profile.dtype} className="" />
        <span className="text-muted-foreground truncate" title={profile.distribution}>
          {profile.distribution}
        </span>
      </div>
      <Stat label="Missing" value={`${profile.null_count} (${fmtPct(profile.null_percentage)})`} />
      <Stat
        label="Unique"
        value={`${profile.unique_count} (${fmtPct(profile.unique_percentage)})`}
      />
      <ProfileBlock profile={profile} />
    </div>
  );
}

/**
 * Type-branched stats, selected by the backend-reported dtype. The matching
 * block's fields may still be null (e.g. an all-null column), in which case the
 * Stat helpers render an em dash.
 */
function ProfileBlock({ profile }: { profile: ColumnProfile }) {
  switch (profile.dtype) {
    case "int":
    case "float":
      return (
        <>
          <Stat label="Mean" value={fmtNum(profile.mean)} />
          <Stat label="Range" value={`${fmtNum(profile.min)} – ${fmtNum(profile.max)}`} />
          <Stat label="Std" value={fmtNum(profile.std)} />
        </>
      );

    case "bool":
      return (
        <>
          <Stat
            label="True"
            value={`${profile.true_count ?? 0} (${fmtPct(profile.true_percentage)})`}
          />
          <Stat
            label="False"
            value={`${profile.false_count ?? 0} (${fmtPct(
              profile.true_percentage == null ? null : 100 - profile.true_percentage,
            )})`}
          />
        </>
      );

    case "datetime":
      return (
        <>
          <Stat label="From" value={profile.min_date ?? "—"} />
          <Stat label="To" value={profile.max_date ?? "—"} />
          {profile.inferred_granularity && (
            <Stat label="Every" value={profile.inferred_granularity} />
          )}
        </>
      );

    case "str": {
      const top = profile.top_values?.[0];
      return (
        <>
          {top && <Stat label="Top" value={`${top.value} (${top.count})`} />}
          <Stat label="Distinct" value={String(profile.cardinality ?? profile.unique_count)} />
        </>
      );
    }

    default:
      return null;
  }
}
