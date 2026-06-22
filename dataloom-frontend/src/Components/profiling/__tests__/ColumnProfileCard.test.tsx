import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ColumnProfileCard from "../ColumnProfileCard";
import type { ColumnProfile } from "../../../api/profiling";

/** A profile with all type-specific blocks null; override per test. */
function makeProfile(overrides: Partial<ColumnProfile>): ColumnProfile {
  return {
    column: "col",
    dtype: "str",
    row_count: 100,
    null_count: 5,
    null_percentage: 5,
    unique_count: 20,
    unique_percentage: 20,
    distribution: "high-cardinality",
    mean: null,
    median: null,
    min: null,
    max: null,
    std: null,
    q1: null,
    q3: null,
    skew: null,
    zero_count: null,
    negative_count: null,
    top_values: null,
    cardinality: null,
    dominant_value_percentage: null,
    rare_value_count: null,
    true_count: null,
    false_count: null,
    true_percentage: null,
    min_date: null,
    max_date: null,
    range_days: null,
    inferred_granularity: null,
    ...overrides,
  };
}

describe("ColumnProfileCard", () => {
  it("shows a skeleton while loading", () => {
    render(<ColumnProfileCard profile={null} loading={true} />);
    expect(screen.getByTestId("column-profile-skeleton")).toBeInTheDocument();
  });

  it("renders the numeric block when numeric fields are present", () => {
    render(
      <ColumnProfileCard
        profile={makeProfile({ dtype: "float", mean: 3.5, min: 1, max: 9, std: 2.1 })}
        loading={false}
      />,
    );
    expect(screen.getByText("Mean")).toBeInTheDocument();
    expect(screen.getByText("1 – 9")).toBeInTheDocument();
    expect(screen.queryByText("Top")).not.toBeInTheDocument();
  });

  it("renders the boolean block when true_percentage is present", () => {
    render(
      <ColumnProfileCard
        profile={makeProfile({ dtype: "bool", true_count: 60, false_count: 40, true_percentage: 60 })}
        loading={false}
      />,
    );
    expect(screen.getByText("True")).toBeInTheDocument();
    expect(screen.getByText("60 (60%)")).toBeInTheDocument();
  });

  it("renders the datetime block when min_date is present", () => {
    render(
      <ColumnProfileCard
        profile={makeProfile({
          dtype: "datetime",
          min_date: "2020-01-01",
          max_date: "2020-12-31",
          inferred_granularity: "day",
        })}
        loading={false}
      />,
    );
    expect(screen.getByText("2020-01-01")).toBeInTheDocument();
    expect(screen.getByText("day")).toBeInTheDocument();
  });

  it("renders the categorical block when top_values are present", () => {
    render(
      <ColumnProfileCard
        profile={makeProfile({
          top_values: [{ value: "alpha", count: 12, percentage: 12 }],
          cardinality: 7,
        })}
        loading={false}
      />,
    );
    expect(screen.getByText("alpha (12)")).toBeInTheDocument();
    expect(screen.getByText("Distinct")).toBeInTheDocument();
  });
});
