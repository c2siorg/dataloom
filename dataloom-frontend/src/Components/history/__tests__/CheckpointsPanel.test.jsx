import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckpointsPanel from "../CheckpointsPanel";

describe("CheckpointsPanel", () => {
  it("renders empty state when no checkpoints are available", () => {
    render(<CheckpointsPanel checkpoints={[]} onClose={() => {}} onRevert={() => {}} />);

    expect(screen.getByText("No checkpoint available")).toBeInTheDocument();
  });

  it("renders all checkpoints and reverts selected one", async () => {
    const user = userEvent.setup();
    const onRevert = vi.fn();

    const checkpoints = [
      {
        id: "newer-id",
        message: "newer checkpoint",
        created_at: "2026-03-01T12:00:00Z",
      },
      {
        id: "older-id",
        message: "older checkpoint",
        created_at: "2026-03-01T11:00:00Z",
      },
    ];

    render(<CheckpointsPanel checkpoints={checkpoints} onClose={() => {}} onRevert={onRevert} />);

    expect(screen.getByText("newer checkpoint")).toBeInTheDocument();
    expect(screen.getByText("older checkpoint")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button", { name: "Revert" });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[1]);
    expect(onRevert).toHaveBeenCalledWith("older-id");
  });
});
