import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "../Modal";

describe("Modal", () => {
  it("renders nothing when isOpen is false", () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog when isOpen is true", () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Visible">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("has correct ARIA attributes", () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Accessible">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Accessible");
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Escapable">
        <p>Press escape</p>
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when overlay is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Overlay">
        <p>Click outside</p>
      </Modal>,
    );
    // Click on the overlay (the outermost div)
    const overlay = screen.getByRole("dialog").parentElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when dialog content is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="No close">
        <p>Click me</p>
      </Modal>,
    );
    await user.click(screen.getByText("Click me"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders close button with aria-label", () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Closeable">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Close btn">
        <p>Content</p>
      </Modal>,
    );
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders without title", () => {
    render(
      <Modal isOpen={true} onClose={() => {}}>
        <p>No title</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("No title")).toBeInTheDocument();
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
  });
});
