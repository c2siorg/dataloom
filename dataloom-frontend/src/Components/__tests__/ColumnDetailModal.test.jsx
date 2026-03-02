import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColumnDetailModal from "../ColumnDetailModal";

const numericProfile = {
  name: "salary",
  dtype: "numeric",
  missing_count: 15,
  missing_percentage: 3.0,
  unique_count: 200,
  numeric_stats: {
    mean: 65000.5,
    median: 60000.0,
    std: 15000.25,
    min: 30000,
    max: 120000,
    q1: 50000.0,
    q3: 78000.0,
    skewness: 0.45,
  },
  categorical_stats: null,
};

const categoricalProfile = {
  name: "department",
  dtype: "categorical",
  missing_count: 2,
  missing_percentage: 0.4,
  unique_count: 8,
  numeric_stats: null,
  categorical_stats: {
    top_values: [
      { value: "Engineering", count: 150 },
      { value: "Sales", count: 120 },
      { value: "Marketing", count: 80 },
      { value: "HR", count: 50 },
      { value: "Finance", count: 40 },
    ],
    mode: "Engineering",
  },
};

describe("ColumnDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when columnProfile is null", () => {
    const { container } = render(
      <ColumnDetailModal columnProfile={null} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the column name and dtype badge", () => {
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={vi.fn()} />);
    expect(screen.getByTestId("column-detail-name")).toHaveTextContent("salary");
    expect(screen.getByTestId("column-detail-dtype")).toHaveTextContent("numeric");
  });

  it("renders all numeric stats for a numeric column", () => {
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={vi.fn()} />);
    const statsSection = screen.getByTestId("numeric-detail-stats");
    expect(statsSection).toHaveTextContent("Mean");
    expect(statsSection).toHaveTextContent("65000.50");
    expect(statsSection).toHaveTextContent("Median");
    expect(statsSection).toHaveTextContent("60,000");
    expect(statsSection).toHaveTextContent("Std Dev");
    expect(statsSection).toHaveTextContent("15000.25");
    expect(statsSection).toHaveTextContent("Min");
    expect(statsSection).toHaveTextContent("30,000");
    expect(statsSection).toHaveTextContent("Max");
    expect(statsSection).toHaveTextContent("120,000");
    expect(statsSection).toHaveTextContent("Q1 (25%)");
    expect(statsSection).toHaveTextContent("50,000");
    expect(statsSection).toHaveTextContent("Q3 (75%)");
    expect(statsSection).toHaveTextContent("78,000");
    expect(statsSection).toHaveTextContent("Skewness");
    expect(statsSection).toHaveTextContent("0.45");
  });

  it("renders top 5 frequent values and mode for a categorical column", () => {
    render(<ColumnDetailModal columnProfile={categoricalProfile} onClose={vi.fn()} />);
    const statsSection = screen.getByTestId("categorical-detail-stats");
    expect(statsSection).toHaveTextContent("Engineering");
    expect(statsSection).toHaveTextContent("150");
    expect(statsSection).toHaveTextContent("Sales");
    expect(statsSection).toHaveTextContent("120");
    expect(statsSection).toHaveTextContent("Marketing");
    expect(statsSection).toHaveTextContent("80");
    expect(statsSection).toHaveTextContent("HR");
    expect(statsSection).toHaveTextContent("50");
    expect(statsSection).toHaveTextContent("Finance");
    expect(statsSection).toHaveTextContent("40");

    const modeSection = screen.getByTestId("categorical-detail-mode");
    expect(modeSection).toHaveTextContent("Mode");
    expect(modeSection).toHaveTextContent("Engineering");
  });

  it("does not render numeric stats for categorical columns", () => {
    render(<ColumnDetailModal columnProfile={categoricalProfile} onClose={vi.fn()} />);
    expect(screen.queryByTestId("numeric-detail-stats")).not.toBeInTheDocument();
  });

  it("does not render categorical stats for numeric columns", () => {
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={vi.fn()} />);
    expect(screen.queryByTestId("categorical-detail-stats")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={onClose} />);
    const backdrop = screen.getByTestId("column-detail-modal");
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the modal content", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={onClose} />);
    const name = screen.getByTestId("column-detail-name");
    await user.click(name);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={onClose} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("displays missing count, percentage, and unique count", () => {
    render(<ColumnDetailModal columnProfile={numericProfile} onClose={vi.fn()} />);
    const modal = screen.getByTestId("column-detail-modal");
    expect(modal).toHaveTextContent("15");
    expect(modal).toHaveTextContent("3.0%");
    expect(modal).toHaveTextContent("200");
  });
});
