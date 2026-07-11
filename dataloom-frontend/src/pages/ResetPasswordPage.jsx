import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CornerDownLeft } from "lucide-react";
import AuthLayout from "../Components/auth/AuthLayout";
import DataLoomLogo from "../Components/common/DataLoomLogo";
import { resetPassword } from "../api/auth";
import { ROUTES } from "../constants/routes";
import { useAuth } from "../context/AuthContext";

const INPUT_CLASS =
  "block w-full rounded-lg border border-app-border bg-surface px-3.5 py-2.5 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();

  if (user) {
    return <Navigate to={ROUTES.home} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!token) {
      setError("Invalid reset link — please request a new one");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      navigate(`${ROUTES.signin}?reset=success`);
    } catch {
      setError("Invalid or expired reset link. Please request a new one.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div>
        <div className="flex items-center gap-2">
          <DataLoomLogo className="h-6 w-6" />
          <span className="text-xl font-semibold text-foreground">DataLoom</span>
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground">Reset password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Enter your new password below.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              New password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                className={`${INPUT_CLASS} pr-16`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium tracking-wide text-gray-400 transition-colors hover:text-gray-600"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-foreground">
              Confirm password
            </label>
            <input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              className={INPUT_CLASS}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="Repeat your password"
            />
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex w-full items-center justify-between rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{submitting ? "Resetting…" : "Reset password"}</span>
          {!submitting && (
            <span className="flex h-6 w-6 items-center justify-center">
              <CornerDownLeft className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </form>

      <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6 text-sm">
        <span className="text-gray-500">Remember your password?</span>
        <Link
          to={ROUTES.signin}
          className="flex items-center gap-1 font-semibold text-accent-hover hover:text-blue-700 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
