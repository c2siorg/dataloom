interface SuggestionCardProps {
  /** Short type chip, e.g. "Histogram" or "Heatmap". */
  typeLabel: string;
  /** Human title of the suggested chart. */
  title: string;
  active: boolean;
  onSelect: () => void;
}

/** A clickable card for one suggested visualization. */
export default function SuggestionCard({
  typeLabel,
  title,
  active,
  onSelect,
}: SuggestionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-w-[180px] flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? "border-blue-500 bg-blue-50"
          : "border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50"
      }`}
    >
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {typeLabel}
      </span>
      <span className="text-sm font-medium text-gray-900">{title}</span>
    </button>
  );
}
