import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext";
import { DatasetProvider } from "./context/DatasetContext";
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
        <DatasetProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Homescreen />} />
                <Route path="/data/:datasetId" element={<DataScreen />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </DatasetProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
