import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider } from "./context/AuthProvider";
import { ProjectProvider } from "./context/ProjectContext";
import ErrorBoundary from "./Components/common/ErrorBoundary";
import ProtectedRoute from "./Components/ProtectedRoute";
import AppLayout from "./Components/layout/AppLayout";
import NotFoundPage from "./pages/NotFoundPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import Homescreen from "./Components/Homescreen";
import DataScreen from "./Components/DataScreen";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SettingsPage from "./pages/settings/SettingsPage";
import SettingsAccountPage from "./pages/settings/SettingsAccountPage";
import SettingsPreferencesPage from "./pages/settings/SettingsPreferencesPage";
import SettingsProjectPage from "./pages/settings/SettingsProjectPage";

/**
 * Root application component with routing, providers, and error boundary.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <ProjectProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/signin" element={<SignInPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                <Route path={"/forgot-password"} element={<ForgotPasswordPage />} />
                <Route path={"/reset-password"} element={<ResetPasswordPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Navigate to="/projects" replace />} />
                    <Route path="/projects" element={<Homescreen />} />
                    <Route path="/workspace/:projectId" element={<DataScreen />} />
                    <Route path="/profile" element={<Navigate to="/settings/account" replace />} />
                    <Route path="/settings" element={<SettingsPage />}>
                      <Route index element={<Navigate to="/settings/account" replace />} />
                      <Route path="account" element={<SettingsAccountPage />} />
                      <Route path="preferences" element={<SettingsPreferencesPage />} />
                      <Route path="projects/:projectId" element={<SettingsProjectPage />} />
                    </Route>
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </ProjectProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
