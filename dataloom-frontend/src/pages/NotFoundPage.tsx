import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiArrowLeft, FiDatabase, FiHome, FiRotateCcw } from "react-icons/fi";
import { ROUTES } from "../constants/routes";

/* ------------------------------------------------------------------ */
/* 404 rendered as a dataframe: every digit is made of clickable cells */
/* ------------------------------------------------------------------ */

const DIGIT_MAP: Record<string, number[][]> = {
  "4": [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  "0": [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
};

const TEXT = "404";
const ROWS = 5;
const COLS = TEXT.length * 4 - 1; // 3 cols per digit + 1 gap between digits

interface Cell {
  key: string;
  row: number;
  col: number;
  filled: boolean;
}

function buildCells(): Cell[] {
  const cells: Cell[] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const digitIndex = Math.floor(col / 4);
      const inDigitCol = col % 4;
      const digit = TEXT[digitIndex];

      const filled =
        inDigitCol < 3 && digit !== undefined && DIGIT_MAP[digit]?.[row]?.[inDigitCol] === 1;

      cells.push({ key: `${row}-${col}`, row, col, filled });
    }
  }

  return cells;
}

interface Line {
  id: number;
  kind: "in" | "out" | "err";
  text: string;
}

export default function NotFoundPage() {
  const navigate = useNavigate();

  const cells = useMemo(buildCells, []);
  const filledKeys = useMemo(() => cells.filter((c) => c.filled).map((c) => c.key), [cells]);

  const [mounted, setMounted] = useState(false);
  const [settled, setSettled] = useState(false);
  const [nulled, setNulled] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<Cell | null>(null);
  const [mouse, setMouse] = useState({ x: 50, y: 40 });

  const [lines] = useState<Line[]>([
    { id: 0, kind: "out", text: "dataloom shell v1.0 — type 'help' to get unlost" },
  ]);
  const termRef = useRef<HTMLDivElement>(null);

  const allNulled = nulled.size === filledKeys.length;

  /* entrance animation */
  useEffect(() => {
    const t1 = setTimeout(() => setMounted(true), 60);
    const t2 = setTimeout(() => setSettled(true), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  /* keep terminal scrolled to bottom */
  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  /* keyboard shortcut: H = home, B = back (ignored while typing) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "h") navigate(ROUTES.home);
      if (e.key.toLowerCase() === "b") navigate(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const toggleCell = (key: string) =>
    setNulled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const nullRandom = () => {
    const remaining = filledKeys.filter((k) => !nulled.has(k));
    if (!remaining.length) return;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    if (pick === undefined) return;
    toggleCell(pick);
  };

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouse({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  /* ripple scale based on distance from hovered cell */
  const scaleFor = (cell: Cell) => {
    if (!hovered) return 1;
    const d = Math.hypot(cell.row - hovered.row, cell.col - hovered.col);
    return 1 + Math.max(0, 0.45 - d * 0.12);
  };

  const hoveredNulled = hovered ? nulled.has(hovered.key) : false;

  return (
    <div
      onMouseMove={onMouseMove}
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground"
    >
      {/* grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(var(--app-grid) 1px, transparent 1px), linear-gradient(90deg, var(--app-grid) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 100%)",
        }}
      />
      {/* cursor spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-300"
        style={{
          background: `radial-gradient(420px circle at ${mouse.x}% ${mouse.y}%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 70%)`,
        }}
      />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-8">
        {/* 404 cell grid */}
        <div className="flex flex-col items-center gap-4">
          <div
            className="grid gap-1.5 sm:gap-2"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
            onMouseLeave={() => setHovered(null)}
          >
            {cells.map((cell) => {
              if (!cell.filled) {
                return <div key={cell.key} className="size-6 sm:size-9 md:size-11" />;
              }
              const isNull = nulled.has(cell.key);
              const scale = mounted ? scaleFor(cell) : 0.4;
              return (
                <button
                  key={cell.key}
                  type="button"
                  aria-label={`Cell ${cell.row},${cell.col}${isNull ? " (NaN)" : ""}`}
                  onMouseEnter={() => setHovered(cell)}
                  onFocus={() => setHovered(cell)}
                  onClick={() => toggleCell(cell.key)}
                  className={`flex size-6 items-center justify-center rounded-md border text-[10px] font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent sm:size-9 sm:rounded-lg sm:text-xs md:size-11 ${
                    isNull
                      ? "border-dashed border-danger-border bg-danger-bg text-danger"
                      : "border-accent-hover/40 bg-accent text-white shadow-sm hover:bg-accent-hover"
                  }`}
                  style={{
                    transform: mounted ? `scale(${scale})` : "translateY(14px) scale(0.4)",
                    opacity: mounted ? 1 : 0,
                    transition: settled
                      ? "transform 180ms ease-out, background-color 200ms, color 200ms"
                      : `transform 550ms cubic-bezier(0.34,1.56,0.64,1) ${
                          (cell.row + cell.col) * 55
                        }ms, opacity 400ms ease ${(cell.row + cell.col) * 55}ms, background-color 200ms`,
                  }}
                >
                  {isNull ? "∅" : ""}
                </button>
              );
            })}
          </div>

          {/* cell inspector */}
          <div className="flex h-7 items-center gap-2 font-mono text-xs text-muted-foreground">
            <FiDatabase className="size-3.5" />
            {allNulled ? (
              <span className="text-danger">page fully dropped. DROP TABLE pages; ✓</span>
            ) : hovered ? (
              <span>
                df.iloc[{hovered.row}, {hovered.col}] ={" "}
                <span className={hoveredNulled ? "text-danger" : "text-accent"}>
                  {hoveredNulled ? "NaN" : "1"}
                </span>{" "}
                · dtype:{" "}
                <span className="text-secondary-foreground">
                  {hoveredNulled ? "float64" : "int64"}
                </span>
              </span>
            ) : (
              <span>hover cells to inspect · click to null them</span>
            )}
          </div>
        </div>

        {/* copy */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {allNulled ? "Okay, you nulled the whole error." : "This page returned NaN."}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            We scanned every row and column. The route you asked for isn&apos;t in this dataset. It
            may have moved, been renamed, or never existed.
          </p>
        </div>

        {/* actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={ROUTES.home}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
          >
            <FiHome className="size-4" />
            Go Home
            <kbd className="ml-1 rounded border border-white/30 px-1 text-[10px] leading-4">H</kbd>
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-md border border-app-border bg-surface px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors duration-150 hover:border-app-border-hover hover:bg-surface-hover"
          >
            <FiArrowLeft className="size-4" />
            Go Back
            <kbd className="ml-1 rounded border border-app-border px-1 text-[10px] leading-4 text-muted-foreground">
              B
            </kbd>
          </button>
          <button
            type="button"
            onClick={nullRandom}
            disabled={allNulled}
            className="inline-flex items-center gap-2 rounded-md border border-app-border bg-surface px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors duration-150 hover:border-app-border-hover hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-disabled-foreground disabled:hover:bg-surface"
          >
            <FiAlertTriangle className="size-4" />
            Null a cell
          </button>
          {nulled.size > 0 && (
            <button
              type="button"
              onClick={() => setNulled(new Set())}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <FiRotateCcw className="size-4" />
              Restore
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
