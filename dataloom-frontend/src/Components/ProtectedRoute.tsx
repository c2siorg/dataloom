import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROUTES } from "../constants/routes";
import LoadingSpinner from "./common/LoadingSpinner";

/**
 * Route guard. Renders nested routes only for an authenticated user;
 * otherwise redirects to the sign-in page, remembering where the user was
 * headed via a `next` query param.
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadingSpinner message="Loading…" />
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${ROUTES.signin}?next=${next}`} replace />;
  }

  return <Outlet />;
}
