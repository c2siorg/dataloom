import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CornerDownLeft,
  KeyRound,
  Mail,
  Pencil,
  UserRound,
  X,
} from "lucide-react";
import { changePassword, deleteAccount, getCurrentUser, updateEmail } from "../api/auth";
import Button from "../Components/common/Button";
import DataLoomLogo from "../Components/common/DataLoomLogo";
import Modal from "../Components/common/Modal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

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

  const handlePasswordSubmit = async (event) => {
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
      showToast("Account deleted successfully.", "success");
      setShowDeleteModal(false);
      setDeletePassword("");
      setAuthUser(null);
      navigate("/signin");
    } catch (error) {
      showToast(getErrorMessage(error, "Failed to delete account."), "error");
    } finally {
      setDeletingAccount(false);
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
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveEmail}
                          disabled={savingEmail}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {savingEmail ? "Saving..." : "Save"}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleCancelEmailEdit}
                          disabled={savingEmail}
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
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

                <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    <div>
                      <h3 className="text-sm font-semibold text-red-700">Delete account</h3>
                      <p className="mt-1 text-sm text-red-600">
                        Permanently delete your account and all associated projects, checkpoints,
                        and logs. This action cannot be undone.
                      </p>

                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="mt-4"
                        onClick={() => setShowDeleteModal(true)}
                      >
                        Delete account
                      </Button>
                    </div>
                  </div>
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

                <Button
                  type="submit"
                  disabled={submittingPassword}
                  className="mt-6 flex w-full items-center justify-between rounded-lg px-4 py-3 bg-accent hover:bg-accent-hover focus:ring-accent"
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
          </div>
        )}

        <Modal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setDeletePassword("");
          }}
          title="Delete Account"
        >
          <p className="mb-4 text-sm text-gray-700">
            This will permanently delete your account and all associated projects, checkpoints, and
            logs. This action cannot be undone.
          </p>

          <label
            htmlFor="deletePassword"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Confirm your password
          </label>
          <input
            id="deletePassword"
            type="password"
            autoComplete="current-password"
            className={INPUT_CLASS}
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleDeleteAccount();
              }
            }}
            placeholder="Enter your password"
          />

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeletePassword("");
              }}
              disabled={deletingAccount}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default ProfilePage;
