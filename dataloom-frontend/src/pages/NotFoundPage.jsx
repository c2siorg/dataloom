import { Link } from "react-router-dom";
import { ROUTES } from "../constants/routes";

/**
 * 404 page displayed for unmatched routes.
 */
export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-gray-600 mb-6">Page not found</p>
      <Link to={ROUTES.home} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
        Go Home
      </Link>
    </div>
  );
}
