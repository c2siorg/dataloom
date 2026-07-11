import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CornerDownLeft } from "lucide-react";
import AuthLayout from "../Components/auth/AuthLayout";
import DataLoomLogo from "../Components/common/DataLoomLogo";
import { forgotPassword } from "../api/auth";
import { ROUTES } from "../constants/routes";
import { useAuth } from "../context/AuthContext";

const INPUT_CLASS =
  "block w-full rounded-lg border border-app-border bg-surface px-3.5 py-2.5 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();

  if (user) {
    return <Navigate to={ROUTES.home} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <AuthLayout>
        <div>
          <div className="flex items-center gap-2">
            <DataLoomLogo className="h-6 w-6" />
            <span className="text-xl font-semibold text-foreground">DataLoom</span>
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
            Check your email
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            If that email exists, we&apos;ve sent a password reset link. Check your inbox.
          </p>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-app-border pt-6 text-sm">
          <span className="text-muted-foreground">Ready to sign in?</span>
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

  return (
    <AuthLayout>
      <div>
        <div className="flex items-center gap-2">
          <DataLoomLogo className="h-6 w-6" />
          <span className="text-xl font-semibold text-foreground">DataLoom</span>
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground">Forgot password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className={INPUT_CLASS}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex w-full items-center justify-between rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{submitting ? "Sending…" : "Send reset link"}</span>
          {!submitting && (
            <span className="flex h-6 w-6 items-center justify-center">
              <CornerDownLeft className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </form>

      <div className="mt-8 flex items-center justify-between border-t border-app-border pt-6 text-sm">
        <span className="text-muted-foreground">Remember your password?</span>
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
