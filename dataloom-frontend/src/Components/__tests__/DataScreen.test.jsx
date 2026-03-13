import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DataScreen from "../DataScreen";

// Mock the ProjectContext
vi.mock("../../context/ProjectContext", () => ({
  useProjectContext: () => ({
    setProjectInfo: vi.fn(),
    refreshProject: vi.fn(),
  }),
}));

// Mock the Table component
vi.mock("../Table", () => ({
  default: () => <div data-testid="table-mock">Table</div>,
}));

// Capture the onColumnClick prop passed to MenuNavbar
let capturedOnColumnClick = null;

vi.mock("../MenuNavbar", () => ({
  default: ({ onColumnClick }) => {
    capturedOnColumnClick = onColumnClick;
    return (
      <div data-testid="menu-navbar-mock">
        <button
          data-testid="trigger-column-click"
          onClick={() =>
            onColumnClick({
              name: "price",
              dtype: "numeric",
              missing_count: 2,
              missing_percentage: 2.0,
              unique_count: 80,
              numeric_stats: {
                mean: 50.0,
                median: 45.0,
                std: 10.0,
                min: 5,
                max: 100,
                q1: 30,
                q3: 70,
                skewness: 0.5,
              },
              categorical_stats: null,
            })
          }
        >
          Click Numeric Column
        </button>
        <button
          data-testid="trigger-categorical-click"
          onClick={() =>
            onColumnClick({
              name: "category",
              dtype: "categorical",
              missing_count: 3,
              missing_percentage: 3.0,
              unique_count: 10,
              numeric_stats: null,
              categorical_stats: {
                top_values: [
                  { value: "Electronics", count: 40 },
                  { value: "Books", count: 30 },
                  { value: "Clothing", count: 20 },
                ],
                mode: "Electronics",
              },
            })
          }
        >
          Click Categorical Column
        </button>
      </div>
    );
  },
}));

const renderDataScreen = () => {
  return render(
    <MemoryRouter initialEntries={["/project/test-project-id"]}>
      <Routes>
        <Route path="/project/:projectId" element={<DataScreen />} />
      </Routes>
    </MemoryRouter>
  );
};

describe("DataScreen - ColumnDetailModal wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnColumnClick = null;
  });

  it("does not render ColumnDetailModal initially", () => {
    renderDataScreen();
    expect(screen.queryByTestId("column-detail-modal")).not.toBeInTheDocument();
  });

  it("passes onColumnClick prop to MenuNavbar", () => {
    renderDataScreen();
    expect(capturedOnColumnClick).toBeTypeOf("function");
  });

  it("opens ColumnDetailModal when onColumnClick is called with a numeric column", async () => {
    const user = userEvent.setup();
    renderDataScreen();

    await user.click(screen.getByTestId("trigger-column-click"));

    const modal = screen.getByTestId("column-detail-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("column-detail-name")).toHaveTextContent("price");
    expect(screen.getByTestId("column-detail-dtype")).toHaveTextContent("numeric");
  });

  it("shows full numeric stats in the ColumnDetailModal", async () => {
    const user = userEvent.setup();
    renderDataScreen();

    await user.click(screen.getByTestId("trigger-column-click"));

    const numericStats = screen.getByTestId("numeric-detail-stats");
    expect(numericStats).toHaveTextContent("Mean");
    expect(numericStats).toHaveTextContent("Median");
    expect(numericStats).toHaveTextContent("Std Dev");
    expect(numericStats).toHaveTextContent("Q1 (25%)");
    expect(numericStats).toHaveTextContent("Q3 (75%)");
    expect(numericStats).toHaveTextContent("Skewness");
  });

  it("closes ColumnDetailModal when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderDataScreen();

    await user.click(screen.getByTestId("trigger-column-click"));
    expect(screen.getByTestId("column-detail-modal")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("column-detail-modal")).not.toBeInTheDocument();
  });

  it("opens ColumnDetailModal for categorical columns with correct stats", async () => {
    const user = userEvent.setup();
    renderDataScreen();

    await user.click(screen.getByTestId("trigger-categorical-click"));

    const modal = screen.getByTestId("column-detail-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("column-detail-name")).toHaveTextContent("category");

    const catStats = screen.getByTestId("categorical-detail-stats");
    expect(catStats).toHaveTextContent("Electronics");
    expect(catStats).toHaveTextContent("Books");
    expect(catStats).toHaveTextContent("Clothing");

    const modeSection = screen.getByTestId("categorical-detail-mode");
    expect(modeSection).toHaveTextContent("Electronics");
  });

  it("renders Table component alongside the modal", async () => {
    const user = userEvent.setup();
    renderDataScreen();

    expect(screen.getByTestId("table-mock")).toBeInTheDocument();

    await user.click(screen.getByTestId("trigger-column-click"));
    // Table should still be visible when modal is open
    expect(screen.getByTestId("table-mock")).toBeInTheDocument();
    expect(screen.getByTestId("column-detail-modal")).toBeInTheDocument();
  });
});
