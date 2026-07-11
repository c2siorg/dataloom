import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Modal from "./common/Modal";
import Button from "./common/Button";
import Select from "./common/Select";
import { exportProject } from "../api";

type FormatDef = {
  ext: string;
  label: string;
  /** Delimiter/header/encoding controls only apply to delimited text. */
  delimited: boolean;
};

const DEFAULT_FORMAT: FormatDef = { ext: "csv", label: "CSV", delimited: true };

const EXPORT_FORMATS: FormatDef[] = [
  DEFAULT_FORMAT,
  { ext: "tsv", label: "TSV", delimited: true },
  { ext: "json", label: "JSON", delimited: false },
  { ext: "xlsx", label: "Excel", delimited: false },
  { ext: "parquet", label: "Parquet", delimited: false },
];

const DELIMITERS = [
  { value: "comma", label: "Comma", shown: "," },
  { value: "tab", label: "Tab", shown: "→" },
  { value: "semicolon", label: "Semicolon", shown: ";" },
  { value: "pipe", label: "Pipe", shown: "|" },
];

const ENCODINGS = [
  { value: "utf-8", label: "UTF-8  ·  Unicode (recommended)" },
  { value: "latin-1", label: "Latin-1  ·  Western European" },
  { value: "ascii", label: "ASCII  ·  English only" },
  { value: "utf-16", label: "UTF-16  ·  Unicode, 2-byte" },
];

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  /** Prefilled file name (without extension); typically the project name. */
  defaultName?: string;
  /** Called with a user-facing message when the export fails. */
  onError?: (message: string) => void;
}

export default function ExportModal({
  isOpen,
  onClose,
  projectId,
  defaultName = "export",
  onError,
}: ExportModalProps) {
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState(() => {
    return localStorage.getItem("defaultExportFormat") || "csv";
  });
  const [delimiter, setDelimiter] = useState("comma");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [encoding, setEncoding] = useState("utf-8");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(defaultName || "export");
    setFormat(localStorage.getItem("defaultExportFormat") || "csv");
    setDelimiter("comma");
    setIncludeHeader(true);
    setEncoding("utf-8");
    setBusy(false);
    setMounted(false);
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [isOpen, defaultName]);

  const def = EXPORT_FORMATS.find((f) => f.ext === format) ?? DEFAULT_FORMAT;
  const showOptions = def.delimited;
  // TSV is tab by definition; a leftover "comma" selection would be misleading.
  const effectiveDelimiter = format === "tsv" && delimiter === "comma" ? "tab" : delimiter;
  const fileName = `${name.trim() || "dataset"}.${format}`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      onError?.("Please enter a file name.");
      return;
    }
    setBusy(true);
    try {
      const { blob } = await exportProject(projectId, {
        format,
        ...(showOptions ? { delimiter: effectiveDelimiter, includeHeader, encoding } : {}),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cleanName}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error("Failed to export project:", err);
      onError?.("Failed to export project.");
    } finally {
      setBusy(false);
    }
  };

  const reveal = (i: number): CSSProperties => ({
    transition: "opacity 320ms ease, transform 320ms ease",
    transitionDelay: `${i * 45}ms`,
    opacity: mounted ? 1 : 0,
    transform: mounted ? "none" : "translateY(6px)",
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export dataset" className="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 font-sans">
        {/* Step 1 — format */}
        <div style={reveal(0)}>
          <Label step="1">Choose a format</Label>
          <div className="grid grid-cols-3 gap-2">
            {EXPORT_FORMATS.map((f) => {
              const on = format === f.ext;
              return (
                <button
                  key={f.ext}
                  type="button"
                  data-testid={`export-format-${f.ext}`}
                  aria-pressed={on}
                  onClick={() => {
                    setFormat(f.ext);
                    if (f.ext === "tsv") setDelimiter("tab");
                    if (f.ext === "csv" && delimiter === "tab") setDelimiter("comma");
                  }}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 ${
                    on
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500/30"
                      : "border-app-border bg-surface hover:border-app-border-hover hover:bg-surface-hover"
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${on ? "text-blue-700" : "text-foreground"}`}
                  >
                    {f.label}
                  </span>
                  <span
                    className={`font-mono text-[11px] ${on ? "text-blue-500" : "text-secondary-foreground"}`}
                  >
                    .{f.ext}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 — file name */}
        <div style={reveal(1)}>
          <Label step="2" htmlFor="export-filename">
            Name the file
          </Label>
          <div className="flex items-stretch overflow-hidden rounded-lg border border-app-border transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/25">
            <input
              id="export-filename"
              data-testid="export-filename"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="dataset"
              className="min-w-0 flex-1 bg-surface px-3 py-2 text-sm text-foreground focus:outline-none"
            />
            <span className="flex items-center border-l border-app-border bg-surface-hover px-3 font-mono text-sm font-medium text-secondary-foreground">
              .{format}
            </span>
          </div>
        </div>

        {/* Step 3 — options (CSV / TSV only) */}
        <div style={reveal(2)}>
          <Label step="3">Text options</Label>
          {showOptions ? (
            <div className="space-y-4">
              {/* Separator */}
              <div>
                <span className="mb-1.5 block text-xs text-secondary-foreground">Column separator</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {DELIMITERS.map((d) => {
                    const on = effectiveDelimiter === d.value;
                    return (
                      <button
                        key={d.value}
                        type="button"
                        aria-pressed={on}
                        aria-label={d.label}
                        title={d.label}
                        onClick={() => setDelimiter(d.value)}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-colors ${
                          on
                            ? "border-blue-500 bg-blue-50"
                            : "border-app-border bg-surface hover:border-app-border-hover"
                        }`}
                      >
                        <span
                          className={`font-mono text-base leading-none ${on ? "text-blue-600" : "text-foreground"}`}
                        >
                          {d.shown}
                        </span>
                        <span className={`text-[10px] ${on ? "text-blue-500" : "text-secondary-foreground"}`}>
                          {d.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Header toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={includeHeader}
                onClick={() => setIncludeHeader((v) => !v)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-app-border bg-surface px-3 py-2 text-left transition-colors hover:border-app-border-hover"
              >
                <span>
                  <span className="block text-sm text-foreground">Include header row</span>
                  <span className="block text-[11px] text-secondary-foreground">
                    Column names as the first line
                  </span>
                </span>
                <span
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    includeHeader ? "bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: includeHeader ? "translateX(18px)" : "translateX(3px)" }}
                  />
                </span>
              </button>

              {/* Encoding (secondary — quiet dropdown) */}
              <label className="block">
                <span className="mb-1.5 block text-xs text-secondary-foreground">Encoding</span>
                <Select value={encoding} onChange={setEncoding} options={ENCODINGS} />
              </label>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-app-border bg-surface px-3 py-3 text-xs leading-relaxed text-secondary-foreground">
              <span className="font-medium text-foreground">{def.label}</span> keeps the original data
              types and structure — no separator, header, or encoding settings needed.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-app-border pt-4">
          <p className="truncate text-xs text-secondary-foreground">
            Downloads <span className="font-mono font-medium text-foreground">{fileName}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="export-confirm" disabled={busy}>
              {busy ? "Exporting…" : "Export"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Numbered step label used down the form. */
function Label({
  step,
  htmlFor,
  children,
}: {
  step: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-2 flex items-center gap-2">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-[10px] font-semibold text-foreground">
        {step}
      </span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </label>
  );
}
