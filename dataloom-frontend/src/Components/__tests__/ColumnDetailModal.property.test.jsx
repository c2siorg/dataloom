// Feature: column-data-profiling, Property 8: Column detail modal renders all required information
import { render, screen, within } from "@testing-library/react";
import fc from "fast-check";
import ColumnDetailModal from "../ColumnDetailModal";

/**
 * Validates: Requirements 5.2, 5.3
 *
 * Property 8: Column detail modal renders all required information
 * For any ColumnProfileSchema object, the rendered ColumnDetailModal should display
 * all type-specific statistics:
 *   - For numeric columns: mean, median, std, min, max, Q1, Q3, and skewness
 *   - For categorical columns: up to 5 top frequent values with counts and the mode
 */

/** Mirror the component's formatNumber logic */
const formatNumber = (value) => {
  if (value == null) return "N/A";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
};

/** Arbitrary for alphanumeric column names */
const columnNameArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase() || "col")
  .filter((s) => s.length > 0 && /^[a-z]/.test(s));

/** Arbitrary for a frequent value entry with unique values */
const frequentValueArb = fc.record({
  value: fc
    .string({ minLength: 1, maxLength: 10 })
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, "").trim() || "val"),
  count: fc.integer({ min: 1, max: 10000 }),
});

/** Arbitrary for numeric stats */
const numericStatsArb = fc.record({
  mean: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  median: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  std: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  min: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  max: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  q1: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  q3: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  skewness: fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
});

/** Arbitrary for categorical stats with unique top_values */
const categoricalStatsArb = fc
  .array(frequentValueArb, { minLength: 1, maxLength: 5 })
  .chain((topValues) => {
    // Deduplicate by value to avoid ambiguous assertions
    const seen = new Set();
    const unique = topValues.filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
    const mode = unique.length > 0 ? unique[0].value : null;
    return fc.constant({
      top_values: unique,
      mode,
    });
  });

/** Arbitrary for a numeric column profile */
const numericColumnArb = fc.record({
  name: columnNameArb,
  dtype: fc.constant("numeric"),
  missing_count: fc.integer({ min: 0, max: 10000 }),
  missing_percentage: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  unique_count: fc.integer({ min: 0, max: 10000 }),
  numeric_stats: numericStatsArb,
  categorical_stats: fc.constant(null),
});

/** Arbitrary for a categorical column profile */
const categoricalColumnArb = fc.record({
  name: columnNameArb,
  dtype: fc.constant("categorical"),
  missing_count: fc.integer({ min: 0, max: 10000 }),
  missing_percentage: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  unique_count: fc.integer({ min: 0, max: 10000 }),
  numeric_stats: fc.constant(null),
  categorical_stats: categoricalStatsArb,
});

describe("Property 8: Column detail modal renders all required information", () => {
  it("should render all numeric stats (mean, median, std, min, max, Q1, Q3, skewness) for numeric columns", () => {
    fc.assert(
      fc.property(numericColumnArb, (column) => {
        const { unmount } = render(
          <ColumnDetailModal columnProfile={column} onClose={() => {}} />
        );

        const statsSection = screen.getByTestId("numeric-detail-stats");

        // All 8 numeric stat fields must be present with correctly formatted values
        expect(statsSection).toHaveTextContent("Mean");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.mean));

        expect(statsSection).toHaveTextContent("Median");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.median));

        expect(statsSection).toHaveTextContent("Std Dev");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.std));

        expect(statsSection).toHaveTextContent("Min");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.min));

        expect(statsSection).toHaveTextContent("Max");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.max));

        expect(statsSection).toHaveTextContent("Q1 (25%)");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.q1));

        expect(statsSection).toHaveTextContent("Q3 (75%)");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.q3));

        expect(statsSection).toHaveTextContent("Skewness");
        expect(statsSection).toHaveTextContent(formatNumber(column.numeric_stats.skewness));

        // Categorical stats should NOT be rendered
        expect(screen.queryByTestId("categorical-detail-stats")).not.toBeInTheDocument();

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it("should render up to 5 top frequent values with counts and mode for categorical columns", () => {
    fc.assert(
      fc.property(categoricalColumnArb, (column) => {
        const { unmount } = render(
          <ColumnDetailModal columnProfile={column} onClose={() => {}} />
        );

        const statsSection = screen.getByTestId("categorical-detail-stats");
        const topFive = (column.categorical_stats.top_values || []).slice(0, 5);

        // Each top value and its count should be displayed
        for (const item of topFive) {
          expect(statsSection).toHaveTextContent(item.value);
          expect(statsSection).toHaveTextContent(item.count.toLocaleString());
        }

        // Mode should be displayed
        const modeSection = within(statsSection).getByTestId("categorical-detail-mode");
        expect(modeSection).toHaveTextContent("Mode");
        expect(modeSection).toHaveTextContent(column.categorical_stats.mode ?? "N/A");

        // Numeric stats should NOT be rendered
        expect(screen.queryByTestId("numeric-detail-stats")).not.toBeInTheDocument();

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
