import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MenuNavbar from "../MenuNavbar";

// Mock react-icons/lu — LuBarChart3 doesn't exist in the installed version
vi.mock("react-icons/lu", () => {
  const Stub = (props) => <span {...props} />;
  return {
    LuFilter: Stub,
    LuArrowUpDown: Stub,
    LuCopyMinus: Stub,
    LuCode: Stub,
    LuTable2: Stub,
    LuSave: Stub,
    LuHistory: Stub,
    LuBookmark: Stub,
    LuChartColumn: Stub,
    LuChartBar: Stub,
    LuX: Stub,
    LuSearch: Stub,
  };
});

// Mock all API calls used by MenuNavbar
vi.mock("../../api", () => ({
  saveProject: vi.fn(),
  getLogs: vi.fn().mockResolvedValue([]),
  getCheckpoints: vi.fn().mockResolvedValue([]),
  getProjectProfile: vi.fn().mockResolvedValue({
    summary: {
      row_count: 100,
      column_count: 3,
      missing_count: 5,
      memory_usage_bytes: 1024,
      duplicate_row_count: 2,
    },
    columns: [
      {
        name: "col1",
        dtype: "numeric",
        missing_count: 3,
        missing_percentage: 3.0,
        unique_count: 50,
        numeric_stats: { mean: 10, median: 9, min: 1, max: 20 },
        categorical_stats: null,
      },
    ],
  }),
}));

// Mock child form/panel components to avoid deep dependency issues
vi.mock("../forms/FilterForm", () => ({
  default: () => <div data-testid="filter-form-mock">FilterForm</div>,
}));
vi.mock("../forms/SortForm", () => ({
  default: () => <div data-testid="sort-form-mock">SortForm</div>,
}));
vi.mock("../forms/DropDuplicateForm", () => ({
  default: () => <div data-testid="drop-dup-form-mock">DropDuplicateForm</div>,
}));
vi.mock("../forms/AdvQueryFilterForm", () => ({
  default: () => <div data-testid="adv-query-form-mock">AdvQueryFilterForm</div>,
}));
vi.mock("../forms/PivotTableForm", () => ({
  default: () => <div data-testid="pivot-form-mock">PivotTableForm</div>,
}));
vi.mock("../history/LogsPanel", () => ({
  default: () => <div data-testid="logs-panel-mock">LogsPanel</div>,
}));
vi.mock("../history/CheckpointsPanel", () => ({
  default: () => <div data-testid="checkpoints-panel-mock">CheckpointsPanel</div>,
}));
vi.mock("../ChartBuilder", () => ({
  default: () => <div data-testid="chart-builder-mock">ChartBuilder</div>,
}));

const defaultProps = {
  projectId: "test-project-123",
  onTransform: vi.fn(),
  onColumnClick: vi.fn(),
};

describe("MenuNavbar - Profile integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a "Profile" button in the Analyze group on the Data tab', () => {
    render(<MenuNavbar {...defaultProps} />);

    const profileButton = screen.getByTestId("profile-button");
    expect(profileButton).toBeInTheDocument();
    expect(profileButton).toHaveTextContent("Profile");

    // The Analyze group label should be visible on the Data tab
    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("opens the ProfilePanel when the Profile button is clicked", async () => {
    const user = userEvent.setup();
    render(<MenuNavbar {...defaultProps} />);

    // Panel should not be visible initially
    expect(screen.queryByTestId("profile-panel")).not.toBeInTheDocument();

    // Click the Profile button
    await user.click(screen.getByTestId("profile-button"));

    // ProfilePanel should now be rendered
    expect(screen.getByTestId("profile-panel")).toBeInTheDocument();
  });

  it("closes the ProfilePanel when the Profile button is clicked again (toggle)", async () => {
    const user = userEvent.setup();
    render(<MenuNavbar {...defaultProps} />);

    const profileButton = screen.getByTestId("profile-button");

    // First click opens the panel
    await user.click(profileButton);
    expect(screen.getByTestId("profile-panel")).toBeInTheDocument();

    // Second click closes the panel
    await user.click(profileButton);
    expect(screen.queryByTestId("profile-panel")).not.toBeInTheDocument();
  });
});
