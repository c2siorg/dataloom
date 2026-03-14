import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Facebook,
  Github,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
  Triangle,
} from "lucide-react";
import DataLoomLogo from "../Components/common/DataLoomLogo";
import { useAuth } from "../context/AuthContext";

const providers = [
  { key: "google", label: "Continue with Google" },
  { key: "facebook", label: "Continue with Facebook", Icon: Facebook },
  { key: "github", label: "Continue with GitHub", Icon: Github },
];

export default function AuthPage() {
  const { isAuthenticated, signInWithProvider, signInWithEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath = location.state?.from?.pathname || "/dashboard";

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  useEffect(() => {
    if (isAuthenticated) navigate(redirectPath, { replace: true });
  }, [isAuthenticated, navigate, redirectPath]);

  const subcopy = useMemo(
    () =>
      mode === "login"
        ? "Welcome back. Sign in to access your projects and pick up where you left off."
        : "Create your DataLoom account to explore datasets, collaborate, and manage transformations.",
    [mode]
  );

  const handleProvider = async (provider) => {
    setError("");
    setLoading(true);
    try {
      await signInWithProvider(provider);
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmail({ ...form, mode });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err.message || "Unable to authenticate");
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (next) => {
    setMode(next);
    setError("");
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-layer">
        <div className="auth-bg-glow-left" />
        <div className="auth-bg-glow-right" />
        <Triangle className="auth-bg-icon" />
      </div>

      <div className="auth-container">
        <div className="auth-brand-row">
          <div className="auth-brand-logo-wrap">
            <DataLoomLogo className="auth-brand-logo" />
          </div>
          <div>
            <p className="auth-brand-title">DataLoom</p>
            <p className="auth-brand-subtitle">Secure access to your workspace</p>
          </div>
        </div>

        <div className="auth-card">
          <header className="auth-header">
            <p className="auth-kicker">Welcome</p>
            <h1 className="auth-title">
              {mode === "login" ? "Sign in to DataLoom" : "Create your DataLoom account"}
            </h1>
            <p className="auth-subcopy">{subcopy}</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" && (
              <div>
                <label className="auth-label">Full name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                  placeholder="Jane Doe"
                />
              </div>
            )}

            <div>
              <label className="auth-label">Email address</label>
              <div className="auth-input-with-icon">
                <Mail className="auth-input-icon" />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="input-field auth-input-padded"
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="auth-label">Password</label>
              <div className="auth-input-with-icon">
                <KeyRound className="auth-input-icon" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="input-field auth-input-padded"
                  placeholder={mode === "login" ? "••••••••" : "Create a strong password"}
                  minLength={6}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="auth-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary auth-submit"
            >
              {loading ? "Working..." : mode === "login" ? "Continue" : "Create account"}
              <ArrowRight className="auth-arrow" />
            </button>
          </form>

          <div className="auth-divider-row">
            <div className="auth-divider-line" />
            <span className="auth-divider-text">or</span>
            <div className="auth-divider-line" />
          </div>

          <div className="auth-provider-list">
            {providers.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleProvider(key)}
                disabled={loading}
                className="auth-provider-btn"
              >
                <div className={`auth-provider-overlay auth-provider-overlay-${key}`} />
                <div className="auth-provider-content">
                  <div className="auth-provider-icon-wrap">
                    {Icon ? <Icon className="auth-provider-icon" /> : <Sparkles className="auth-provider-icon" />}
                  </div>
                  <div className="auth-provider-text-wrap">
                    <p className="auth-provider-title">{label}</p>
                    <p className="auth-provider-subtitle">Use your {key} account</p>
                  </div>
                  <ArrowRight className="auth-provider-arrow" />
                </div>
              </button>
            ))}
          </div>

          <div className="auth-mode-switch-row">
            {mode === "login" ? "New to DataLoom?" : "Already have an account?"} {" "}
            <button
              onClick={() => changeMode(mode === "login" ? "register" : "login")}
              className="auth-mode-switch-btn"
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </div>

          <p className="auth-legal">
            This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.
          </p>
        </div>
      </div>
    </div>
  );
}
