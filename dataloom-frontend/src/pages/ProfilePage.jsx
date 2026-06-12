import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  CornerDownLeft,
  KeyRound,
  Mail,
  Pencil,
  UserRound,
  X,
} from "lucide-react";
import { changePassword, getCurrentUser, updateEmail } from "../api/auth";
import DataLoomLogo from "../Components/common/DataLoomLogo";
import Toast from "../Components/common/Toast";
import { useAuth } from "../context/AuthContext";

const INPUT_CLASS =
  "block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 " +
  "placeholder-gray-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const getErrorMessage = (error, fallback) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "detail" in error.response.data &&
    typeof error.response.data.detail === "string"
  ) {
    return error.response.data.detail;
  }

  return fallback;
};

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [email, setEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [savingEmail, setSavingEmail] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const { setUser: setAuthUser } = useAuth();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await getCurrentUser();
        setUser(res);
        setEmail(res.email);
      } catch (error) {
        setToast({
          message: getErrorMessage(error, "Failed to load profile."),
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const formatDate = (value) => {
    if (!value) return "—";

    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleEditEmail = () => {
    setEmail(user?.email || "");
    setIsEditingEmail(true);
  };

  const handleCancelEmailEdit = () => {
    setEmail(user?.email || "");
    setIsEditingEmail(false);
  };

  const handleSaveEmail = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setToast({ message: "Email is required.", type: "error" });
      return;
    }

    setSavingEmail(true);

    try {
      const updatedUser = await updateEmail(trimmedEmail);
      setUser(updatedUser);
      setAuthUser(updatedUser);
      setEmail(updatedUser.email);
      setIsEditingEmail(false);

      setToast({
        message: "Email updated successfully.",
        type: "success",
      });
    } catch (error) {
      setToast({
        message: getErrorMessage(error, "Failed to update email."),
        type: "error",
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();

    if (!currentPassword) {
      setToast({ message: "Current password is required.", type: "error" });
      return;
    }

    if (password !== confirm) {
      setToast({ message: "Passwords do not match.", type: "error" });
      return;
    }

    if (password.length < 8) {
      setToast({
        message: "Password must be at least 8 characters.",
        type: "error",
      });
      return;
    }

    setSubmittingPassword(true);

    try {
      const response = await changePassword(currentPassword, password);

      setToast({
        message: response.message || "Password changed successfully.",
        type: "success",
      });

      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (error) {
      setToast({
        message: getErrorMessage(error, "Failed to change password."),
        type: "error",
      });
    } finally {
      setSubmittingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-2">
          <DataLoomLogo className="h-7 w-7" />
          <span className="text-xl font-semibold text-slate-900">DataLoom</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Profile</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            View your account details and manage password settings.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
            Loading profile...
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <UserRound className="h-7 w-7" />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Account details</h2>
                  <p className="text-sm text-gray-500">Your profile details.</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-gray-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    <Mail className="h-4 w-4" />
                    Email
                  </div>

                  {isEditingEmail ? (
                    <div className="mt-2 space-y-2">
                      <input
                        type="email"
                        required
                        className={INPUT_CLASS}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                      />

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEmail}
                          disabled={savingEmail}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {savingEmail ? "Saving..." : "Save"}
                        </button>

                        <button
                          type="button"
                          onClick={handleCancelEmailEdit}
                          disabled={savingEmail}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="break-all text-sm font-medium text-slate-900">
                        {user?.email || "—"}
                      </p>

                      <button
                        type="button"
                        onClick={handleEditEmail}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:border-accent hover:text-accent"
                        aria-label="Edit email"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gray-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    <CalendarDays className="h-4 w-4" />
                    Joined
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">
                    {formatDate(user?.created_at)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <KeyRound className="h-7 w-7" />
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
                  <p className="text-sm text-gray-500">
                    Enter your current password and set a new one.
                  </p>
                </div>
              </div>

              <form onSubmit={handlePasswordSubmit} className="mt-6">
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="currentPassword"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Current password
                    </label>
                    <div className="relative">
                      <input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        className={`${INPUT_CLASS} pr-16`}
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium tracking-wide text-gray-400 transition-colors hover:text-gray-600"
                      >
                        {showCurrentPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
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
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium tracking-wide text-gray-400 transition-colors hover:text-gray-600"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="confirm"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Confirm password
                    </label>
                    <div className="relative">
                      <input
                        id="confirm"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        className={`${INPUT_CLASS} pr-16`}
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                        placeholder="Repeat your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium tracking-wide text-gray-400 transition-colors hover:text-gray-600"
                      >
                        {showConfirmPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingPassword}
                  className="mt-6 flex w-full items-center justify-between rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{submittingPassword ? "Submitting..." : "Change password"}</span>
                  {!submittingPassword && (
                    <span className="flex h-6 w-6 items-center justify-center">
                      <CornerDownLeft className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </form>
            </section>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
