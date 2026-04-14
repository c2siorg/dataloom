import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProjectProvider } from "./context/ProjectContext";
import ProtectedRoute from "./Components/auth/ProtectedRoute";
import PublicOnlyRoute from "./Components/auth/PublicOnlyRoute";
import FullPageSpinner from "./Components/common/FullPageSpinner";
import ErrorBoundary from "./Components/common/ErrorBoundary";
import AppLayout from "./Components/layout/AppLayout";
import NotFoundPage from "./pages/NotFoundPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Homescreen from "./Components/Homescreen";
import DataScreen from "./Components/DataScreen";
import { ROUTES } from "./constants/routes";

function AuthLanding() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  return <Navigate to={isAuthenticated ? ROUTES.home : ROUTES.login} replace />;
}

function ProtectedApp() {
  return (
    <ProjectProvider>
      <AppLayout />
    </ProjectProvider>
  );
}

/**
 * Root application component with routing, providers, and error boundary.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AuthLanding />} />
              <Route element={<PublicOnlyRoute />}>
                <Route path={ROUTES.login} element={<LoginPage />} />
                <Route path={ROUTES.register} element={<RegisterPage />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route element={<ProtectedApp />}>
                  <Route path={ROUTES.home} element={<Homescreen />} />
                  <Route path={ROUTES.workspace} element={<DataScreen />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
