import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { CategoryTabs } from "../components/CategoryTabs.js";
import { CommandCard } from "../components/CommandCard.js";
import { CATEGORIES, COMMANDS } from "../data/commands.js";

export const Route = createFileRoute("/commands/$category")({
	validateSearch: (search: Record<string, unknown>) => ({
		q: typeof search.q === "string" ? search.q : undefined,
	}),
	component: CommandsPage,
});

function CommandsPage() {
	const { category } = Route.useParams();
	const { q } = Route.useSearch();
	const query = q?.toLowerCase().trim() ?? "";

	const visibleCategories = useMemo(() => {
		return CATEGORIES.filter((cat) => cat.id !== "all");
	}, []);

	const commandsToShow = useMemo(() => {
		const filtered = category === "all" ? COMMANDS : COMMANDS.filter((c) => c.category === category);
		if (!query) return filtered;
		return filtered.filter(
			(c) => c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query),
		);
	}, [category, query]);

	// Group commands by category for display
	const grouped = useMemo(() => {
		if (category !== "all") {
			return [{ cat: CATEGORIES.find((c) => c.id === category)!, commands: commandsToShow }];
		}
		return visibleCategories
			.map((cat) => ({
				cat,
				commands: commandsToShow.filter((c) => c.category === cat.id),
			}))
			.filter((g) => g.commands.length > 0);
	}, [category, commandsToShow, visibleCategories]);

	const matchedNames = useMemo(() => new Set(commandsToShow.map((c) => c.name)), [commandsToShow]);

	return (
		<>
			<CategoryTabs />
			<main className="mx-auto max-w-5xl px-6 py-8">
				{/* Page header */}
				<div className="mb-6">
					<h1 className="text-3xl font-extrabold">Commands</h1>
					<p className="mt-1 text-sm text-slate-500">
						{COMMANDS.length} commands across {CATEGORIES.length - 1} categories — search above or browse by category
					</p>
				</div>

				{/* Search banner */}
				{query && (
					<div className="mb-6 flex items-center gap-2.5 rounded-lg border border-[#7c3aed]/25 bg-[#7c3aed]/08 px-4 py-2.5 text-sm text-violet-400">
						<svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
						Showing {commandsToShow.length} result{commandsToShow.length !== 1 ? "s" : ""} for{" "}
						<strong>"{q}"</strong>
					</div>
				)}

				{/* No results */}
				{commandsToShow.length === 0 && (
					<div className="py-16 text-center text-slate-500">
						<div className="mb-2 text-4xl">🔍</div>
						<p>No commands matched <strong className="text-slate-400">"{q}"</strong></p>
					</div>
				)}

				{/* Category sections */}
				{grouped.map(({ cat, commands: catCommands }) => {
					const allCommands = COMMANDS.filter((c) => c.category === cat.id);
					const hasMatch = query ? catCommands.length > 0 : true;
					const isDimmed = query && !hasMatch;

					return (
						<section key={cat.id} className={`mb-10 transition-opacity duration-150 ${isDimmed ? "opacity-25 pointer-events-none" : ""}`}>
							<div className="mb-4 flex items-center gap-3">
								<span className="text-2xl">{cat.icon}</span>
								<div>
									<h2 className="text-lg font-bold">{cat.label}</h2>
									<p className="text-xs text-slate-500">{cat.description}</p>
								</div>
							</div>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{allCommands.map((cmd) => (
									<CommandCard
										key={cmd.name}
										command={cmd}
										highlighted={!!query && matchedNames.has(cmd.name)}
										dimmed={!!query && !matchedNames.has(cmd.name)}
									/>
								))}
							</div>
						</section>
					);
				})}
			</main>
		</>
	);
}
