import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Navbar } from "../components/Navbar.js";

export const Route = createRootRoute({
	component: () => (
		<div className="min-h-screen bg-[#0d0d1a] text-slate-100">
			<Navbar />
			<Outlet />
		</div>
	),
});
