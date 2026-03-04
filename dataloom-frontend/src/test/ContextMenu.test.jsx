import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi } from "vitest";
import ContextMenu from "../Components/ContextMenu";

describe("ContextMenu", () => {
  const position = { x: 100, y: 100 };

  test("renders actions when menu is open", () => {
    render(
      <ContextMenu
        isOpen
        position={position}
        contextData={null}
        onClose={vi.fn()}
        actions={() => <button>Test Action</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Test Action" })).toBeInTheDocument();
  });

  test("closes when Escape key is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ContextMenu
        isOpen
        position={position}
        contextData={null}
        onClose={onClose}
        actions={() => null}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes when clicking outside the menu", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <div>
        <div data-testid="outside" />
        <ContextMenu
          isOpen
          position={position}
          contextData={null}
          onClose={onClose}
          actions={() => <button>Action</button>}
        />
      </div>,
    );

    await user.click(screen.getByTestId("outside"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes when clicking a menu item", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ContextMenu
        isOpen
        position={position}
        contextData={null}
        onClose={onClose}
        actions={() => <button>Action</button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Action" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes on page scroll", () => {
    const onClose = vi.fn();

    render(
      <ContextMenu
        isOpen
        position={position}
        contextData={null}
        onClose={onClose}
        actions={() => null}
      />,
    );

    window.dispatchEvent(new Event("scroll"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("does not render when menu is closed", () => {
    const { container } = render(
      <ContextMenu
        isOpen={false}
        position={position}
        contextData={null}
        onClose={vi.fn()}
        actions={() => <button>Action</button>}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
