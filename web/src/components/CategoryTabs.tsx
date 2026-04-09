import { Link, useParams } from "@tanstack/react-router";
import { CATEGORIES, COMMANDS } from "../data/commands.js";

export function CategoryTabs() {
	const { category: activeCategory } = useParams({ from: "/commands/$category" });

	const countFor = (id: string) =>
		id === "all" ? COMMANDS.length : COMMANDS.filter((c) => c.category === id).length;

	return (
		<div className="sticky top-14 z-40 border-b border-white/[0.06] bg-[#0d0d1a]">
			<div className="mx-auto max-w-5xl overflow-x-auto scrollbar-none">
				<div className="flex min-w-max">
					{CATEGORIES.map((cat) => {
						const isActive = cat.id === activeCategory;
						return (
							<Link
								key={cat.id}
								to="/commands/$category"
								params={{ category: cat.id }}
								className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3.5 text-xs font-medium no-underline transition-colors duration-150 ${
									isActive
										? "border-[#7c3aed] text-violet-400"
										: "border-transparent text-slate-500 hover:text-slate-300"
								}`}
							>
								<span>{cat.icon}</span>
								<span>{cat.label}</span>
								<span
									className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
										isActive ? "bg-[#7c3aed]/40 text-violet-300" : "bg-[#7c3aed]/10 text-violet-500"
									}`}
								>
									{countFor(cat.id)}
								</span>
							</Link>
						);
					})}
				</div>
			</div>
		</div>
	);
}
