import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext";
import { ProjectProvider } from "./context/ProjectContext";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ErrorBoundary from "./Components/common/ErrorBoundary";
import ProtectedRoute from "./Components/common/ProtectedRoute";
import AppLayout from "./Components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import DatasetExplorer from "./pages/DatasetExplorer";
import Workspace from "./pages/Workspace";
import ProfilePage from "./pages/ProfilePage";
import NotFoundPage from "./pages/NotFoundPage";
import AuthPage from "./pages/AuthPage";

/**
 * Root application component with routing, providers, and error boundary.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ProjectProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/auth" element={<AuthPage />} />
                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/projects" element={<DatasetExplorer />} />
                    <Route path="/workspace/:projectId" element={<Workspace />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/auth" replace />} />
                </Routes>
              </BrowserRouter>
            </ProjectProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
