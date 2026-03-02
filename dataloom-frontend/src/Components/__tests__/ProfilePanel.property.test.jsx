// Feature: column-data-profiling, Property 7: Column card renders all required information
import { render, screen, within } from "@testing-library/react";
import fc from "fast-check";
import ProfilePanel from "../ProfilePanel";

/**
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5
 *
 * Property 7: Column card renders all required information
 * For any ColumnProfileSchema object, the rendered ProfilePanel card should contain:
 *   - The column name
 *   - Data type
 *   - Missing count
 *   - Missing percentage
 *   - Unique count
 * Additionally:
 *   - For numeric columns: mean, median, min, max
 *   - For categorical columns: up to 3 top frequent values with counts
 */

/** Mirror the component's formatNumber logic */
const formatNumber = (value) => {
  if (value == null) return "N/A";
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
};

/** Arbitrary for alphanumeric column names (valid as data-testid) */
const columnNameArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => s.replace(/[^a-z0-9]/gi, "").toLowerCase() || "col")
  .filter((s) => s.length > 0 && /^[a-z]/.test(s));

/** Arbitrary for a frequent value entry with unique prefixed values */
const frequentValueArb = fc.record({
  value: fc
    .integer({ min: 1000, max: 9999 })
    .map((n) => `fv${n}`),
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

/** Arbitrary for categorical stats with unique values */
const categoricalStatsArb = fc
  .array(frequentValueArb, { minLength: 0, maxLength: 5 })
  .map((arr) => {
    // Deduplicate by value
    const seen = new Set();
    const unique = arr.filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
    return {
      top_values: unique,
      mode: unique.length > 0 ? unique[0].value : null,
    };
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

/** Arbitrary for a boolean/datetime column (no type-specific stats) */
const otherColumnArb = fc.record({
  name: columnNameArb,
  dtype: fc.constantFrom("boolean", "datetime"),
  missing_count: fc.integer({ min: 0, max: 10000 }),
  missing_percentage: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  unique_count: fc.integer({ min: 0, max: 10000 }),
  numeric_stats: fc.constant(null),
  categorical_stats: fc.constant(null),
});

/** Arbitrary for any column profile */
const columnProfileArb = fc.oneof(numericColumnArb, categoricalColumnArb, otherColumnArb);

/** Minimal valid dataset summary */
const summaryArb = fc.record({
  row_count: fc.integer({ min: 0, max: 100000 }),
  column_count: fc.integer({ min: 1, max: 100 }),
  missing_count: fc.integer({ min: 0, max: 100000 }),
  memory_usage_bytes: fc.integer({ min: 0, max: 1e9 }),
  duplicate_row_count: fc.integer({ min: 0, max: 100000 }),
});


describe("Property 7: Column card renders all required information", () => {
  it("should render column name, dtype, missing count/percentage, and unique count for any column", () => {
    fc.assert(
      fc.property(summaryArb, columnProfileArb, (summary, column) => {
        const profileData = {
          summary,
          columns: [column],
        };

        const { unmount } = render(
          <ProfilePanel
            profileData={profileData}
            onClose={() => {}}
            onColumnClick={() => {}}
          />
        );

        const card = screen.getByTestId(`column-card-${column.name}`);

        // Column name is displayed
        expect(within(card).getByTestId("column-name")).toHaveTextContent(
          column.name
        );

        // Data type badge is displayed
        expect(within(card).getByTestId("column-dtype")).toHaveTextContent(
          column.dtype
        );

        // Missing count and percentage are displayed
        const missingEl = within(card).getByTestId("column-missing");
        expect(missingEl).toHaveTextContent(String(column.missing_count));
        expect(missingEl).toHaveTextContent(
          `${column.missing_percentage.toFixed(1)}%`
        );

        // Unique count is displayed
        expect(within(card).getByTestId("column-unique")).toHaveTextContent(
          String(column.unique_count)
        );

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it("should render mean, median, min, and max for numeric columns", () => {
    fc.assert(
      fc.property(summaryArb, numericColumnArb, (summary, column) => {
        const profileData = {
          summary,
          columns: [column],
        };

        const { unmount } = render(
          <ProfilePanel
            profileData={profileData}
            onClose={() => {}}
            onColumnClick={() => {}}
          />
        );

        const card = screen.getByTestId(`column-card-${column.name}`);
        const numStats = within(card).getByTestId("numeric-stats");

        expect(numStats).toHaveTextContent(
          `Mean: ${formatNumber(column.numeric_stats.mean)}`
        );
        expect(numStats).toHaveTextContent(
          `Median: ${formatNumber(column.numeric_stats.median)}`
        );
        expect(numStats).toHaveTextContent(
          `Min: ${formatNumber(column.numeric_stats.min)}`
        );
        expect(numStats).toHaveTextContent(
          `Max: ${formatNumber(column.numeric_stats.max)}`
        );

        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it("should render up to 3 top frequent values with counts for categorical columns", () => {
    fc.assert(
      fc.property(summaryArb, categoricalColumnArb, (summary, column) => {
        const profileData = {
          summary,
          columns: [column],
        };

        const { unmount, container } = render(
          <ProfilePanel
            profileData={profileData}
            onClose={() => {}}
            onColumnClick={() => {}}
          />
        );

        const card = within(container).getByTestId(`column-card-${column.name}`);
        const topThree = (column.categorical_stats.top_values || []).slice(
          0,
          3
        );

        if (topThree.length > 0) {
          const catStats = within(card).getByTestId("categorical-stats");
          for (const item of topThree) {
            expect(catStats).toHaveTextContent(item.value);
            expect(catStats).toHaveTextContent(String(item.count));
          }
        } else {
          // No categorical stats rendered when top_values is empty
          expect(
            within(card).queryByTestId("categorical-stats")
          ).not.toBeInTheDocument();
        }

        // Values beyond the top 3 should NOT appear
        const beyondThree = (column.categorical_stats.top_values || []).slice(3);
        if (beyondThree.length > 0 && topThree.length > 0) {
          const catStats = within(card).getByTestId("categorical-stats");
          for (const item of beyondThree) {
            // Only check if the value is unique (not also in top 3)
            const inTopThree = topThree.some(
              (t) => t.value === item.value || String(t.count) === String(item.count)
            );
            if (!inTopThree) {
              expect(catStats).not.toHaveTextContent(item.value);
            }
          }
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
