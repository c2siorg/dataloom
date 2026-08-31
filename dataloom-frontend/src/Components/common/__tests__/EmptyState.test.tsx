import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import EmptyState from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title as a heading", () => {
    render(<EmptyState title="No projects yet" />);

    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(<EmptyState title="No projects yet" description="Upload a dataset to get started." />);

    expect(screen.getByText("Upload a dataset to get started.")).toBeInTheDocument();
  });

  it("omits the description when not provided", () => {
    const { container } = render(<EmptyState title="No projects yet" />);

    expect(container.querySelector("p")).toBeNull();
  });

  it("renders the action element", () => {
    render(
      <EmptyState title="No projects yet" action={<button>Create your first project</button>} />,
    );

    expect(screen.getByRole("button", { name: "Create your first project" })).toBeInTheDocument();
  });

  it("renders the icon when provided", () => {
    render(<EmptyState title="No projects yet" icon={<svg data-testid="icon" />} />);

    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders the inline variant without a heading", () => {
    render(<EmptyState variant="inline" title="No logs available" />);

    expect(screen.getByText("No logs available")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("does not render the action in the inline variant", () => {
    render(<EmptyState variant="inline" title="No logs available" action={<button>Add</button>} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
