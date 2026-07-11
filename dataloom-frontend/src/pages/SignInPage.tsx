import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CornerDownLeft } from "lucide-react";
import AuthLayout from "../Components/auth/AuthLayout";
import DataLoomLogo from "../Components/common/DataLoomLogo";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROUTES } from "../constants/routes";

const INPUT_CLASS =
  "block w-full rounded-lg border border-app-border bg-surface px-3.5 py-2.5 text-sm text-foreground " +
  "placeholder-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export default function SignInPage() {
  const { user, signin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — no reason to show the form.
  if (user) return <Navigate to={ROUTES.home} replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signin(email, password);
      navigate(next || ROUTES.home, { replace: true });
    } catch (err: any) {
      // `detail` is a string for most errors, but an array of objects for
      // FastAPI 422 validation failures — only a string is safe to render.
      const detail = err?.response?.data?.detail;
      showToast(
        typeof detail === "string" ? detail : "Could not sign in. Please try again.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signupHref = next ? `${ROUTES.signup}?next=${encodeURIComponent(next)}` : ROUTES.signup;
  const resetSuccess = params.get("reset") === "success";

  return (
    <AuthLayout>
      <div>
        <div className="flex items-center gap-2">
          <DataLoomLogo className="h-6 w-6" />
          <span className="text-xl font-semibold text-foreground">DataLoom</span>
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground">Welcome back</h2>
        <p className="mt-1.5 text-sm text-secondary-foreground">Continue to your workspace.</p>
      </div>

      {resetSuccess && (
        <div className="my-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          Password reset successfully. Please sign in with your new password.
        </div>
      )}

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
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className={`${INPUT_CLASS} pr-16`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium tracking-wide text-gray-400 transition-colors hover:text-gray-600"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <div className="flex justify-end mt-2">
              <Link
                to={ROUTES.forgotPassword}
                className="text-xs text-muted-foreground hover:text-accent hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex w-full items-center justify-between rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{submitting ? "Signing in…" : "Continue"}</span>
          {!submitting && (
            <span className="flex h-6 w-6 items-center justify-center">
              <CornerDownLeft className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </form>

      <div className="mt-8 flex items-center justify-between border-t border-app-border pt-6 text-sm">
        <span className="text-muted-foreground">New to DataLoom?</span>
        <Link
          to={signupHref}
          className="flex items-center gap-1 font-semibold text-accent-hover hover:text-blue-700 hover:underline"
        >
          Create account
        </Link>
      </div>
    </AuthLayout>
  );
}
