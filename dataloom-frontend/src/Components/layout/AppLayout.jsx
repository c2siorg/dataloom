import { Outlet } from "react-router-dom";
import Navbar from "../Navbar";

/**
 * Application layout wrapper with navbar and main content area.
 */
export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <Navbar />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
