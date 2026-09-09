import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  WorkspaceTabsProvider,
  useWorkspaceTabs,
  type WorkspaceTab,
} from "../context/WorkspaceTabsContext";
import { INITIAL_TABS } from "../Components/DataScreen";
import { PanelProvider } from "../context/PanelContext";
import { ColumnProfilesProvider, useColumnProfilesView } from "../context/ColumnProfilesContext";
import WorkspaceTabBar from "../Components/workspace/WorkspaceTabBar";
import type { ReactNode } from "react";

const DATASET = { id: "dataset", title: "DataSet", type: "dataset", closeable: true };
const PINNED = { id: "pinned", title: "Pinned", type: "x", closeable: false };

// Surfaces the active tab id so tests can assert selection without reaching into internals.
function ActiveProbe() {
  const { activeTabId } = useWorkspaceTabs();
  return <span data-testid="active-id">{activeTabId ?? "none"}</span>;
}

// Surfaces the column-profiles flag, which is otherwise only visible inside the table.
function ProfilesProbe() {
  const { showColumnProfiles } = useColumnProfilesView();
  return <span data-testid="profiles-on">{String(showColumnProfiles)}</span>;
}

function renderBar(initialTabs: WorkspaceTab[], children?: ReactNode) {
  return render(
    <WorkspaceTabsProvider projectId="p1" initialTabs={initialTabs}>
      <PanelProvider>
        <ColumnProfilesProvider>
          <WorkspaceTabBar />
          <ActiveProbe />
          <ProfilesProbe />
          {children}
        </ColumnProfilesProvider>
      </PanelProvider>
    </WorkspaceTabsProvider>,
  );
}

describe("WorkspaceTabBar", () => {
  it("opens DataSet and Summary on load, grid active, profiles on", () => {
    renderBar(INITIAL_TABS);

    expect(screen.getByTestId("workspace-tab-summary")).toBeInTheDocument();
    expect(screen.getByTestId("active-id")).toHaveTextContent("dataset");
    expect(screen.getByTestId("profiles-on")).toHaveTextContent("true");
  });

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

  it("opens profiling dropdown menu when '+' is clicked", async () => {
    const user = userEvent.setup();
    renderBar([DATASET]);

    await user.click(screen.getByTestId("workspace-tab-add"));

    expect(screen.getByTestId("workspace-add-tab-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-add-tab-option-summary")).toHaveTextContent("Summary");
    expect(screen.getByTestId("workspace-add-tab-option-column-profiles")).toHaveTextContent(
      "Column Profiles",
    );
    expect(screen.getByTestId("workspace-add-tab-option-charts")).toHaveTextContent("Charts");
    expect(screen.getByTestId("workspace-add-tab-option-quality")).toHaveTextContent("Quality");
  });

  it("opens Summary tab when Summary option is clicked from '+' dropdown", async () => {
    const user = userEvent.setup();
    renderBar([DATASET]);

    await user.click(screen.getByTestId("workspace-tab-add"));
    await user.click(screen.getByTestId("workspace-add-tab-option-summary"));

    expect(screen.getByTestId("active-id")).toHaveTextContent("summary");
  });

  it("opens Charts tab when Charts option is clicked from '+' dropdown", async () => {
    const user = userEvent.setup();
    renderBar([DATASET]);

    await user.click(screen.getByTestId("workspace-tab-add"));
    await user.click(screen.getByTestId("workspace-add-tab-option-charts"));

    expect(screen.getByTestId("active-id")).toHaveTextContent("charts");
  });

  it("opens Quality tab when Quality option is clicked from '+' dropdown", async () => {
    const user = userEvent.setup();
    renderBar([DATASET]);

    await user.click(screen.getByTestId("workspace-tab-add"));
    await user.click(screen.getByTestId("workspace-add-tab-option-quality"));

    expect(screen.getByTestId("active-id")).toHaveTextContent("quality");
  });

  it("lists the registered Profiling actions in ribbon order", async () => {
    const user = userEvent.setup();
    renderBar([DATASET]);

    await user.click(screen.getByTestId("workspace-tab-add"));

    // Derived from the feature registry, so this guards the ribbon's own
    // ordering rather than a hand-maintained copy of it.
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Summary",
      "Column Profiles",
      "Charts",
      "Quality",
    ]);
  });

  describe("Column Profiles option", () => {
    it("opens the DataSet tab and keeps profiles on", async () => {
      const user = userEvent.setup();
      renderBar([DATASET, { id: "a", title: "Pivot", type: "x", closeable: true }]);
      await user.click(screen.getByTestId("workspace-tab-a"));

      await user.click(screen.getByTestId("workspace-tab-add"));
      await user.click(screen.getByTestId("workspace-add-tab-option-column-profiles"));

      expect(screen.getByTestId("active-id")).toHaveTextContent("dataset");
      expect(screen.getByTestId("profiles-on")).toHaveTextContent("true");
    });

    it("toggles profiles when already on the DataSet tab", async () => {
      const user = userEvent.setup();
      renderBar([DATASET]);

      await user.click(screen.getByTestId("workspace-tab-add"));
      await user.click(screen.getByTestId("workspace-add-tab-option-column-profiles"));
      expect(screen.getByTestId("profiles-on")).toHaveTextContent("false");

      await user.click(screen.getByTestId("workspace-tab-add"));
      await user.click(screen.getByTestId("workspace-add-tab-option-column-profiles"));
      expect(screen.getByTestId("profiles-on")).toHaveTextContent("true");
    });

    it("keeps profiles off across a tab switch", async () => {
      const user = userEvent.setup();
      renderBar(INITIAL_TABS);

      await user.click(screen.getByTestId("workspace-tab-add"));
      await user.click(screen.getByTestId("workspace-add-tab-option-column-profiles"));
      await user.click(screen.getByTestId("workspace-tab-summary"));
      await user.click(screen.getByTestId("workspace-tab-dataset"));

      expect(screen.getByTestId("profiles-on")).toHaveTextContent("false");
    });

    it("reopens a closed DataSet tab with profiles on", async () => {
      const user = userEvent.setup();
      renderBar(INITIAL_TABS);

      // Profiles are on; move away, then close the DataSet tab.
      await user.click(screen.getByTestId("workspace-tab-summary"));
      await user.click(screen.getByTestId("workspace-tab-close-dataset"));
      expect(screen.queryByTestId("workspace-tab-dataset")).not.toBeInTheDocument();

      // One click must bring the table back with the row showing, rather than
      // silently flipping the flag and leaving no visible route to the data.
      await user.click(screen.getByTestId("workspace-tab-add"));
      await user.click(screen.getByTestId("workspace-add-tab-option-column-profiles"));

      expect(screen.getByTestId("workspace-tab-dataset")).toBeInTheDocument();
      expect(screen.getByTestId("active-id")).toHaveTextContent("dataset");
      expect(screen.getByTestId("profiles-on")).toHaveTextContent("true");
    });
  });

  describe("menu keyboard support", () => {
    it("focuses the first item when the menu opens", async () => {
      const user = userEvent.setup();
      renderBar([DATASET]);

      await user.click(screen.getByTestId("workspace-tab-add"));

      expect(screen.getByTestId("workspace-add-tab-option-summary")).toHaveFocus();
    });

    it("moves focus with the arrow keys and wraps at both ends", async () => {
      const user = userEvent.setup();
      renderBar([DATASET]);
      await user.click(screen.getByTestId("workspace-tab-add"));

      await user.keyboard("{ArrowDown}");
      expect(screen.getByTestId("workspace-add-tab-option-column-profiles")).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByTestId("workspace-add-tab-option-summary")).toHaveFocus();

      // Wraps backwards from the first item to the last.
      await user.keyboard("{ArrowUp}");
      expect(screen.getByTestId("workspace-add-tab-option-quality")).toHaveFocus();

      // And forwards from the last back to the first.
      await user.keyboard("{ArrowDown}");
      expect(screen.getByTestId("workspace-add-tab-option-summary")).toHaveFocus();
    });

    it("jumps to the last and first items with End and Home", async () => {
      const user = userEvent.setup();
      renderBar([DATASET]);
      await user.click(screen.getByTestId("workspace-tab-add"));

      await user.keyboard("{End}");
      expect(screen.getByTestId("workspace-add-tab-option-quality")).toHaveFocus();

      await user.keyboard("{Home}");
      expect(screen.getByTestId("workspace-add-tab-option-summary")).toHaveFocus();
    });

    it("opens from the trigger with ArrowDown", async () => {
      const user = userEvent.setup();
      renderBar([DATASET]);
      screen.getByTestId("workspace-tab-add").focus();

      await user.keyboard("{ArrowDown}");

      expect(screen.getByTestId("workspace-add-tab-dropdown")).toBeInTheDocument();
      expect(screen.getByTestId("workspace-add-tab-option-summary")).toHaveFocus();
    });

    it("closes on Escape and returns focus to the '+' button", async () => {
      const user = userEvent.setup();
      renderBar([DATASET]);
      await user.click(screen.getByTestId("workspace-tab-add"));

      await user.keyboard("{Escape}");

      expect(screen.queryByTestId("workspace-add-tab-dropdown")).not.toBeInTheDocument();
      expect(screen.getByTestId("workspace-tab-add")).toHaveFocus();
    });

    it("returns focus to the '+' button after choosing an item", async () => {
      const user = userEvent.setup();
      renderBar([DATASET]);
      await user.click(screen.getByTestId("workspace-tab-add"));

      await user.click(screen.getByTestId("workspace-add-tab-option-summary"));

      expect(screen.getByTestId("workspace-tab-add")).toHaveFocus();
    });
  });
});
