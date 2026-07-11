import { Outlet } from "react-router-dom";
import Navbar from "../Navbar";

/**
 * Application layout wrapper with navbar and main content area.
 */
export default function AppLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Navbar />
      <main className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
