import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfilePanel from "../ProfilePanel";

const mockProfileData = {
  summary: {
    row_count: 1000,
    column_count: 5,
    missing_count: 42,
    memory_usage_bytes: 2048000,
    duplicate_row_count: 7,
  },
  columns: [
    {
      name: "age",
      dtype: "numeric",
      missing_count: 10,
      missing_percentage: 1.0,
      unique_count: 50,
      numeric_stats: { mean: 35.5, median: 34.0, min: 18, max: 90 },
      categorical_stats: null,
    },
    {
      name: "city",
      dtype: "categorical",
      missing_count: 5,
      missing_percentage: 0.5,
      unique_count: 20,
      numeric_stats: null,
      categorical_stats: {
        top_values: [
          { value: "New York", count: 200 },
          { value: "London", count: 150 },
          { value: "Tokyo", count: 100 },
          { value: "Paris", count: 80 },
        ],
        mode: "New York",
      },
    },
    {
      name: "active",
      dtype: "boolean",
      missing_count: 0,
      missing_percentage: 0.0,
      unique_count: 2,
      numeric_stats: null,
      categorical_stats: null,
    },
  ],
};

const defaultProps = {
  profileData: mockProfileData,
  onClose: vi.fn(),
  onColumnClick: vi.fn(),
};

describe("ProfilePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when profileData is null", () => {
    const { container } = render(
      <ProfilePanel profileData={null} onClose={vi.fn()} onColumnClick={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the dataset summary section", () => {
    render(<ProfilePanel {...defaultProps} />);
    const summary = screen.getByTestId("dataset-summary");
    expect(summary).toBeInTheDocument();
    expect(screen.getByTestId("summary-rows")).toHaveTextContent("1,000");
    expect(screen.getByTestId("summary-columns")).toHaveTextContent("5");
    expect(screen.getByTestId("summary-missing")).toHaveTextContent("42");
    expect(screen.getByTestId("summary-memory")).toHaveTextContent("2.0 MB");
    expect(screen.getByTestId("summary-duplicates")).toHaveTextContent("7");
  });

  it("renders the correct number of column cards", () => {
    render(<ProfilePanel {...defaultProps} />);
    const columnList = screen.getByTestId("column-list");
    const cards = columnList.children;
    expect(cards).toHaveLength(3);
  });

  it("renders column name and dtype badge on each card", () => {
    render(<ProfilePanel {...defaultProps} />);
    const ageCard = screen.getByTestId("column-card-age");
    expect(within(ageCard).getByTestId("column-name")).toHaveTextContent("age");
    expect(within(ageCard).getByTestId("column-dtype")).toHaveTextContent("numeric");
  });

  it("renders missing count/percentage and unique count", () => {
    render(<ProfilePanel {...defaultProps} />);
    const ageCard = screen.getByTestId("column-card-age");
    expect(within(ageCard).getByTestId("column-missing")).toHaveTextContent("Missing: 10 (1.0%)");
    expect(within(ageCard).getByTestId("column-unique")).toHaveTextContent("Unique: 50");
  });

  it("renders compact numeric stats for numeric columns", () => {
    render(<ProfilePanel {...defaultProps} />);
    const ageCard = screen.getByTestId("column-card-age");
    const numStats = within(ageCard).getByTestId("numeric-stats");
    expect(numStats).toHaveTextContent("Mean: 35.50");
    expect(numStats).toHaveTextContent("Median: 34");
    expect(numStats).toHaveTextContent("Min: 18");
    expect(numStats).toHaveTextContent("Max: 90");
  });

  it("renders top 3 categorical values for categorical columns", () => {
    render(<ProfilePanel {...defaultProps} />);
    const cityCard = screen.getByTestId("column-card-city");
    const catStats = within(cityCard).getByTestId("categorical-stats");
    expect(catStats).toHaveTextContent("New York");
    expect(catStats).toHaveTextContent("200");
    expect(catStats).toHaveTextContent("London");
    expect(catStats).toHaveTextContent("150");
    expect(catStats).toHaveTextContent("Tokyo");
    expect(catStats).toHaveTextContent("100");
    // 4th value should NOT appear (only top 3)
    expect(catStats).not.toHaveTextContent("Paris");
  });

  it("does not render numeric or categorical stats for boolean columns", () => {
    render(<ProfilePanel {...defaultProps} />);
    const activeCard = screen.getByTestId("column-card-active");
    expect(within(activeCard).queryByTestId("numeric-stats")).not.toBeInTheDocument();
    expect(within(activeCard).queryByTestId("categorical-stats")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<ProfilePanel {...defaultProps} />);
    await user.click(screen.getByTestId("profile-panel-close"));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("calls onColumnClick with column name when a card is clicked", async () => {
    const user = userEvent.setup();
    render(<ProfilePanel {...defaultProps} />);
    await user.click(screen.getByTestId("column-card-city"));
    expect(defaultProps.onColumnClick).toHaveBeenCalledWith("city");
  });

  it("formats memory in KB for small values", () => {
    const smallMemory = {
      ...mockProfileData,
      summary: { ...mockProfileData.summary, memory_usage_bytes: 512 },
    };
    render(<ProfilePanel {...defaultProps} profileData={smallMemory} />);
    expect(screen.getByTestId("summary-memory")).toHaveTextContent("512 B");
  });
});
