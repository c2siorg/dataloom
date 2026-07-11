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
  AlertTriangle,
} from "lucide-react";
import { changePassword, deleteAccount, getCurrentUser, updateEmail } from "../../api/auth";
import Modal from "../../Components/common/Modal";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../context/ToastContext";
import type { User } from "./types";
import Button from "../../Components/common/Button";

const INPUT_CLASS =
  "block w-full rounded-lg border border-app-border bg-background px-3.5 py-2.5 text-sm text-foreground " +
  "placeholder-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object" &&
    (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
  ) {
    return (error as { response: { data: { detail: string } } }).response.data.detail;
  }
  return fallback;
};

export default function SettingsAccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  const { setUser: setAuthUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await getCurrentUser();
        setUser(res);
        setEmail(res.email);
      } catch (error) {
        showToast(getErrorMessage(error, "Failed to load profile."), "error");
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [showToast]);

  const formatDate = (value: string | null | undefined): string => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleSaveEmail = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showToast("Email is required.", "error");
      return;
    }
    setSavingEmail(true);
    try {
      const updatedUser = await updateEmail(trimmedEmail);
      setUser(updatedUser);
      setAuthUser(updatedUser);
      setEmail(updatedUser.email);
      setIsEditingEmail(false);
      showToast("Email updated successfully.", "success");
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to update email."), "error");
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      showToast("Current password is required.", "error");
      return;
    }
    if (password !== confirm) {
      showToast("Passwords do not match.", "error");
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters.", "error");
      return;
    }
    setSubmittingPassword(true);
    try {
      const response = await changePassword(currentPassword, password);
      showToast(response.message || "Password changed successfully.", "success");
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to change password."), "error");
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast("Password is required.", "error");
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      setAuthUser(null);
      navigate("/signin");
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to delete account."), "error");
      setDeletingAccount(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Account</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Manage your account details and security settings.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-app-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
              <UserRound className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Account details</h2>
              <p className="text-sm text-muted-foreground">Your profile details.</p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-app-border bg-elevated p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleSaveEmail}
                      disabled={savingEmail}
                      size="sm"
                      className="flex items-center justify-center gap-2"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {savingEmail ? "Saving..." : "Save"}
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      type="button"
                      onClick={() => {
                        setEmail(user?.email || "");
                        setIsEditingEmail(false);
                      }}
                      disabled={savingEmail}
                      className="flex items-center justify-center gap-2"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="break-all text-sm font-medium text-foreground">
                    {user?.email || "—"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(user?.email || "");
                      setIsEditingEmail(true);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-surface text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                    aria-label="Edit email"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-app-border bg-elevated p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                Joined
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {formatDate(user?.created_at)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-app-border bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
              <KeyRound className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Change password</h2>
              <p className="text-sm text-muted-foreground">
                Enter your current password and set a new one.
              </p>
            </div>
          </div>
          <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
            {(
              [
                {
                  id: "currentPassword",
                  label: "Current password",
                  value: currentPassword,
                  setter: setCurrentPassword,
                  show: showCurrentPassword,
                  toggle: setShowCurrentPassword,
                  placeholder: "Enter current password",
                  autoComplete: "current-password",
                },
                {
                  id: "password",
                  label: "New password",
                  value: password,
                  setter: setPassword,
                  show: showPassword,
                  toggle: setShowPassword,
                  placeholder: "Minimum 8 characters",
                  autoComplete: "new-password",
                },
                {
                  id: "confirm",
                  label: "Confirm password",
                  value: confirm,
                  setter: setConfirm,
                  show: showConfirmPassword,
                  toggle: setShowConfirmPassword,
                  placeholder: "Repeat your password",
                  autoComplete: "new-password",
                },
              ] as const
            ).map(({ id, label, value, setter, show, toggle, placeholder, autoComplete }) => (
              <div key={id}>
                <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
                  {label}
                </label>
                <div className="relative">
                  <input
                    id={id}
                    type={show ? "text" : "password"}
                    autoComplete={autoComplete}
                    required
                    className={`${INPUT_CLASS} pr-16`}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={placeholder}
                  />
                  <button
                    type="button"
                    onClick={() => toggle((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium tracking-wide text-gray-400 transition-colors hover:text-gray-600"
                  >
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            ))}

            <Button
              type="submit"
              disabled={submittingPassword}
              className="flex items-center justify-between w-full"
            >
              <span>{submittingPassword ? "Submitting..." : "Change password"}</span>
              {!submittingPassword && (
                <span className="flex h-6 w-6 items-center justify-center">
                  <CornerDownLeft className="h-3.5 w-3.5" />
                </span>
              )}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-danger-border bg-danger-bg p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-danger">Delete account</h2>
              <p className="text-sm text-danger/60">
                Permanently delete your account and all associated projects, checkpoints, and logs.
                This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Button variant="danger" type="button" onClick={() => setShowDeleteModal(true)}>
              Delete account
            </Button>
          </div>
        </section>
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeletePassword("");
        }}
        title="Delete Account"
      >
        <p className="text-sm text-danger mb-4">
          This will permanently delete your account and all associated projects, checkpoints, and
          logs. This action cannot be undone.
        </p>
        <label
          htmlFor="deletePassword"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Confirm your password
        </label>
        <input
          id="deletePassword"
          type="password"
          autoComplete="current-password"
          className={INPUT_CLASS}
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Enter your password"
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setShowDeleteModal(false);
              setDeletePassword("");
            }}
            disabled={deletingAccount}
          >
            Cancel
          </Button>

          <Button
            variant="danger"
            type="button"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? "Deleting..." : "Delete account"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
