import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EmptyState from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No projects yet" />);

    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(
      <EmptyState
        title="No projects yet"
        description="Upload a dataset to get started. Your recent projects will appear here."
      />,
    );

    expect(
      screen.getByText("Upload a dataset to get started. Your recent projects will appear here."),
    ).toBeInTheDocument();
  });

  it("omits the description when it is not provided", () => {
    const { container } = render(<EmptyState title="No projects yet" />);

    expect(container.querySelector("p")).not.toBeInTheDocument();
  });

  it("renders an optional action", () => {
    render(
      <EmptyState
        title="No projects yet"
        action={
          <button type="button" data-testid="new-project-card">
            Create your first project
          </button>
        }
      />,
    );

    expect(screen.getByTestId("new-project-card")).toHaveTextContent("Create your first project");
  });

  it("omits the action when it is not provided", () => {
    render(<EmptyState title="No projects yet" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders compact title-only content without the card layout", () => {
    const { container } = render(<EmptyState compact title="No logs available" />);

    expect(screen.getByText("No logs available")).toBeInTheDocument();
    expect(container.querySelector("h3")).not.toBeInTheDocument();
  });
});
