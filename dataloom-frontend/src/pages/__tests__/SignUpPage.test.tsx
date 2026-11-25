import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SignUpPage from "../SignUpPage";

const mockSignup = vi.fn();
const mockNavigate = vi.fn();
const mockShowToast = vi.fn();

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    signup: mockSignup,
  }),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

// PasswordStrengthMeter makes network-free DOM calls that are irrelevant here.
vi.mock("../../Components/auth/PasswordStrengthMeter", () => ({
  default: () => null,
}));

vi.mock("../../Components/auth/AuthLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../Components/common/DataLoomLogo", () => ({
  default: () => null,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>,
  );

const fillAndSubmit = async (email = "test@example.com", password = "Password1!") => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
    fireEvent.submit(screen.getByRole("button", { name: /continue/i }).closest("form")!);
  });
};

describe("SignUpPage – error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the string detail message on a plain error response", async () => {
    mockSignup.mockRejectedValue({
      response: { data: { detail: "Email already registered." } },
    });

    renderPage();
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("Email already registered.", "error");
    });
  });

  it("extracts msg fields from a FastAPI 422 array detail", async () => {
    // FastAPI returns `detail` as an array of validation-error objects when a
    // request body fails Pydantic validation (HTTP 422 Unprocessable Entity).
    mockSignup.mockRejectedValue({
      response: {
        data: {
          detail: [
            {
              type: "value_error",
              loc: ["body", "password"],
              msg: "Password must contain at least 3 of the following: lowercase, uppercase, digit, and special character.",
              input: "12345678",
            },
          ],
        },
      },
    });

    renderPage();
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "Password must contain at least 3 of the following: lowercase, uppercase, digit, and special character.",
        "error",
      );
    });
  });

  it("joins multiple msg fields when the 422 detail contains more than one error", async () => {
    mockSignup.mockRejectedValue({
      response: {
        data: {
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address" },
            { loc: ["body", "password"], msg: "field required" },
          ],
        },
      },
    });

    renderPage();
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "value is not a valid email address, field required",
        "error",
      );
    });
  });

  it("falls back to the generic message when no detail is present", async () => {
    mockSignup.mockRejectedValue(new Error("Network Error"));

    renderPage();
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "Could not create your account. Please try again.",
        "error",
      );
    });
  });

  it("navigates home on successful signup", async () => {
    mockSignup.mockResolvedValue({ id: "u1", email: "test@example.com" });

    renderPage();
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
