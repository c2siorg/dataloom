import { useRef, useState } from "react";
import { LuPlus, LuX } from "react-icons/lu";
import type { IssueSeverity, OutlierMethod, PatternRule } from "../../api/quality";
import { useProjectContext } from "../../context/ProjectContext";
import { useQualityView } from "../../context/QualityViewContext";
import Button from "../common/Button";
import ColumnSelect from "../common/ColumnSelect";
import Select, { type SelectOption } from "../common/Select";

const METHOD_OPTIONS: SelectOption[] = [
  { value: "iqr", label: "IQR fences (robust default)" },
  { value: "zscore", label: "Z-score (assumes bell-shaped data)" },
];

const SEVERITY_OPTIONS: SelectOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

// Conventional defaults, shown as placeholders: Tukey's 1.5×IQR / |z| > 3.
const DEFAULT_SENSITIVITY: Record<OutlierMethod, number> = { iqr: 1.5, zscore: 3 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Wrapping in <label> associates the control implicitly (the popover-based
  // Select renders a button, so htmlFor has no input id to point at).
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

/** A pattern rule plus a client-side id, so list edits have stable keys. */
interface DraftRule extends PatternRule {
  id: number;
}

interface QualityConfigPanelProps {
  onClose: () => void;
}

/**
 * Quality assessment configuration, docked in the right side panel like the
 * transform forms. Outlier settings and per-column regex rules are gathered
 * here; Run hands them to QualityViewContext, which shows the scored report in
 * the Quality tab.
 */
export default function QualityConfigPanel({ onClose }: QualityConfigPanelProps) {
  const { columns } = useProjectContext() as unknown as { columns: string[] };
  const { run, loading } = useQualityView();

  const [method, setMethod] = useState<OutlierMethod>("iqr");
  const [sensitivity, setSensitivity] = useState("");
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [ruleColumn, setRuleColumn] = useState("");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleSeverity, setRuleSeverity] = useState<IssueSeverity>("medium");
  const nextRuleId = useRef(0);

  const addRule = () => {
    if (!ruleColumn || !rulePattern) return;
    const id = nextRuleId.current++;
    setRules((prev) => [
      ...prev,
      { id, column: ruleColumn, pattern: rulePattern, severity: ruleSeverity },
    ]);
    setRuleColumn("");
    setRulePattern("");
    setRuleSeverity("medium");
  };

  const handleRun = () => {
    const parsed = Number(sensitivity);
    run({
      outlier_method: method,
      outlier_sensitivity: sensitivity && parsed > 0 ? parsed : null,
      pattern_rules: rules.map(({ id: _id, ...rule }) => rule),
    });
  };

  return (
    <div data-testid="quality-config-panel">
      <Field label="Outlier method">
        <Select
          data-testid="outlier-method-select"
          value={method}
          onChange={(v) => setMethod(v as OutlierMethod)}
          options={METHOD_OPTIONS}
        />
      </Field>

      <Field label="Outlier sensitivity">
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={sensitivity}
          onChange={(e) => setSensitivity(e.target.value)}
          placeholder={`Default: ${DEFAULT_SENSITIVITY[method]}`}
          className="w-full rounded-md border border-app-border bg-surface px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {method === "iqr"
            ? "Fence multiplier — higher flags less."
            : "|z| threshold — higher flags less."}
        </p>
      </Field>

      <fieldset className="mb-3">
        <legend className="mb-1 block text-sm font-medium text-foreground">Pattern rules</legend>
        {rules.length > 0 && (
          <ul className="mb-2 space-y-1">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-2 rounded-md border border-app-border bg-surface-hover px-2 py-1 text-xs text-foreground"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{rule.column}</span>
                  <span className="text-muted-foreground"> must match </span>
                  <code className="text-foreground">{rule.pattern}</code>
                </span>
                <button
                  type="button"
                  aria-label={`Remove rule for ${rule.column}`}
                  onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
                  className="shrink-0 text-muted-foreground hover:text-red-500"
                >
                  <LuX className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <ColumnSelect
            data-testid="rule-column-select"
            value={ruleColumn}
            onChange={setRuleColumn}
            options={columns}
            placeholder="Column…"
          />
          <input
            type="text"
            value={rulePattern}
            onChange={(e) => setRulePattern(e.target.value)}
            placeholder="Regex, e.g. [A-Z]{2}-\d{4}"
            className="w-full rounded-md border border-app-border bg-surface px-3 py-2 font-mono text-sm text-foreground focus:border-blue-500 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select
                data-testid="rule-severity-select"
                value={ruleSeverity}
                onChange={(v) => setRuleSeverity(v as IssueSeverity)}
                options={SEVERITY_OPTIONS}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={addRule}
              disabled={!ruleColumn || !rulePattern}
            >
              <LuPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Values in the column must fully match the pattern.
        </p>
      </fieldset>

      <div className="mt-4 flex justify-between">
        <Button type="button" onClick={handleRun} disabled={loading}>
          {loading ? "Assessing…" : "Run assessment"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
