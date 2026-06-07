import { useEffect, useState, type FormEvent } from "react";
import Modal from "./common/Modal";
import Button from "./common/Button";
import { exportProject } from "../api";

const EXPORT_FORMATS = [
  { ext: "csv", label: "CSV" },
  { ext: "tsv", label: "TSV" },
  { ext: "json", label: "JSON" },
  { ext: "xlsx", label: "Excel" },
  { ext: "parquet", label: "Parquet" },
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

/**
 * "Save As"-style export dialog: name the file, pick a target format, download.
 * The backend converts the working copy to the chosen format; the typed name
 * plus the selected extension determine the downloaded file name.
 */
export default function ExportModal({
  isOpen,
  onClose,
  projectId,
  defaultName = "export",
  onError,
}: ExportModalProps) {
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState("csv");

  useEffect(() => {
    if (isOpen) {
      setName(defaultName || "export");
      setFormat("csv");
    }
  }, [isOpen, defaultName]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const fileName = name.trim();
    if (!fileName) {
      onError?.("Please enter a file name.");
      return;
    }
    try {
      const { blob } = await exportProject(projectId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      onError?.("Failed to export project.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export dataset">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="export-filename" className="block text-sm font-medium text-gray-700 mb-1.5">
            File name
          </label>
          <div className="flex items-stretch rounded-lg border border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 transition-colors overflow-hidden">
            <input
              id="export-filename"
              data-testid="export-filename"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="dataset"
              autoFocus
              className="flex-1 min-w-0 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none"
            />
            <span className="flex items-center px-3 text-sm font-medium text-gray-400 bg-gray-50 border-l border-gray-200 tabular-nums">
              .{format}
            </span>
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1.5">Format</span>
          <div className="grid grid-cols-5 gap-2">
            {EXPORT_FORMATS.map((fmt) => {
              const selected = format === fmt.ext;
              return (
                <button
                  key={fmt.ext}
                  type="button"
                  data-testid={`export-format-${fmt.ext}`}
                  aria-pressed={selected}
                  onClick={() => setFormat(fmt.ext)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 transition-all duration-150 ${
                    selected
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500/40"
                      : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                  }`}
                >
                  <span className={`text-xs font-semibold ${selected ? "text-blue-700" : "text-gray-700"}`}>
                    {fmt.label}
                  </span>
                  <span className={`text-[10px] tabular-nums ${selected ? "text-blue-500" : "text-gray-400"}`}>
                    .{fmt.ext}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-gray-500 truncate">
            Saving as{" "}
            <span className="font-medium text-gray-700">
              {name.trim() || "dataset"}.{format}
            </span>
          </p>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="export-confirm">
              Export
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
