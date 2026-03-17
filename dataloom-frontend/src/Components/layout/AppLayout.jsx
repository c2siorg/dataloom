import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../Navbar";

/**
 * Application layout wrapper with navbar and main content area.
 */
export default function AppLayout() {
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith("/workspace/");

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-bg">
      <Navbar />
      <main className={`flex-1 ${isWorkspace ? "pt-12" : "pt-16"}`}>
        <Outlet />
      </main>
    </div>
  );
}
