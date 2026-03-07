import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext";
import { ProjectProvider } from "./context/ProjectContext";
import ErrorBoundary from "./Components/common/ErrorBoundary";
import AppLayout from "./Components/layout/AppLayout";
import NotFoundPage from "./pages/NotFoundPage";
import Homescreen from "./Components/Homescreen";
import DataScreen from "./Components/DataScreen";

/**
 * Root application component with routing, providers, and error boundary.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ProjectProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="/projects" element={<Homescreen />} />
                <Route path="/workspace/:projectId" element={<DataScreen />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ProjectProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
