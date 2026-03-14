import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft } from "lucide-react";

/**
 * 404 Not Found page with modern dark design.
 */
export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center h-full animate-fade-in">
      <div className="text-center max-w-md">
        <div className="relative mb-8">
          <span className="text-[120px] font-black text-surface-800/50 leading-none select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-bold text-gradient">Oops!</span>
          </div>
        </div>
        <h1 className="text-xl font-semibold text-surface-200 mb-2">
          Page not found
        </h1>
        <p className="text-surface-400 text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="btn-primary flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
