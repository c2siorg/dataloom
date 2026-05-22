import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CornerDownLeft } from "lucide-react";
import AuthLayout from "../Components/auth/AuthLayout";
import DataLoomLogo from "../Components/common/DataLoomLogo";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ROUTES } from "../constants/routes";

const INPUT_CLASS =
  "block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 " +
  "placeholder-gray-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export default function SignUpPage() {
  const { user, signup } = useAuth();
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

    // Mirror the backend's bcrypt-driven 8–72 byte password rule client-side.
    const passwordBytes = new TextEncoder().encode(password).length;
    if (passwordBytes < 8) {
      showToast("Password must be at least 8 characters.", "error");
      return;
    }
    if (passwordBytes > 72) {
      showToast("Password is too long (max 72 characters).", "error");
      return;
    }

    setSubmitting(true);
    try {
      await signup(email, password);
      navigate(next || ROUTES.home, { replace: true });
    } catch (err: any) {
      // `detail` is a string for most errors, but an array of objects for
      // FastAPI 422 validation failures — only a string is safe to render.
      const detail = err?.response?.data?.detail;
      showToast(
        typeof detail === "string" ? detail : "Could not create your account. Please try again.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signinHref = next ? `${ROUTES.signin}?next=${encodeURIComponent(next)}` : ROUTES.signin;

  return (
    <AuthLayout>
      <div>
        <div className="flex items-center gap-2">
          <DataLoomLogo className="h-6 w-6" />
          <span className="text-xl font-semibold text-slate-900">DataLoom</span>
        </div>
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
          Create your account
        </h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Start transforming your CSV data with DataLoom.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
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
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
              Password
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
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium tracking-wide text-gray-400 transition-colors hover:text-gray-600"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">At least 8 characters.</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex w-full items-center justify-between rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{submitting ? "Creating account…" : "Continue"}</span>
          {!submitting && (
            <span className="flex items-center justify-center">
              <CornerDownLeft className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </form>

      <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6 text-sm">
        <span className="text-gray-500">Already have an account?</span>
        <Link
          to={signinHref}
          className="flex items-center gap-1 font-semibold text-accent-hover hover:text-blue-700 hover:underline"
        >
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
