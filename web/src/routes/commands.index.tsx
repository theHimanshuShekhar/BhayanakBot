import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/commands/")({
	beforeLoad: () => {
		throw redirect({ to: "/commands/$category", params: { category: "all" } });
	},
});
