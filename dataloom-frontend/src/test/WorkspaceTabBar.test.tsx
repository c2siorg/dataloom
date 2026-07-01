import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceTabsProvider, useWorkspaceTabs } from "../context/WorkspaceTabsContext";
import WorkspaceTabBar from "../Components/workspace/WorkspaceTabBar";
import type { ReactNode } from "react";

const DATASET = { id: "dataset", title: "DataSet", type: "dataset", closeable: true };
const PINNED = { id: "pinned", title: "Pinned", type: "x", closeable: false };

// Surfaces the active tab id so tests can assert selection without reaching into internals.
function ActiveProbe() {
  const { activeTabId } = useWorkspaceTabs();
  return <span data-testid="active-id">{activeTabId ?? "none"}</span>;
}

function renderBar(initialTabs: (typeof DATASET)[], children?: ReactNode) {
  return render(
    <WorkspaceTabsProvider projectId="p1" initialTabs={initialTabs}>
      <WorkspaceTabBar />
      <ActiveProbe />
      {children}
    </WorkspaceTabsProvider>,
  );
}

describe("WorkspaceTabBar", () => {
  it("renders a tab per entry", () => {
    renderBar([DATASET, { id: "a", title: "Pivot", type: "x", closeable: true }]);
    expect(screen.getByTestId("workspace-tab-dataset")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-a")).toBeInTheDocument();
  });

  it("clicking a tab activates it", async () => {
    const user = userEvent.setup();
    renderBar([DATASET, { id: "a", title: "Pivot", type: "x", closeable: true }]);

    await user.click(screen.getByTestId("workspace-tab-a"));

    expect(screen.getByTestId("active-id")).toHaveTextContent("a");
  });

  it("clicking the close button removes the tab", async () => {
    const user = userEvent.setup();
    renderBar([DATASET, { id: "a", title: "Pivot", type: "x", closeable: true }]);

    await user.click(screen.getByTestId("workspace-tab-close-a"));

    expect(screen.queryByTestId("workspace-tab-a")).not.toBeInTheDocument();
  });

  it("omits the close button on non-closeable tabs", () => {
    renderBar([PINNED]);
    expect(screen.queryByTestId("workspace-tab-close-pinned")).not.toBeInTheDocument();
  });
});
