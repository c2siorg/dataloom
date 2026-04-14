import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ROUTES } from "../../constants/routes";
import { useAuth } from "../../context/AuthContext";
import FullPageSpinner from "../common/FullPageSpinner";

export default function ProtectedRoute() {
  const { isLoading, isAuthenticated, error } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
