import type { Command } from "../data/commands.js";

interface CommandCardProps {
	command: Command;
	highlighted?: boolean;
	dimmed?: boolean;
}

export function CommandCard({ command, highlighted, dimmed }: CommandCardProps) {
	return (
		<div
			className={`flex flex-col gap-1.5 rounded-xl border p-4 transition-all duration-150 ${
				dimmed
					? "border-white/[0.04] opacity-30"
					: highlighted
						? "border-[#7c3aed] bg-[#7c3aed]/10"
						: "border-white/[0.06] bg-[#1a1a2e] hover:border-[#7c3aed]/40 hover:bg-[#1e1b4b]/40"
			}`}
		>
			<span className="font-mono text-sm font-semibold text-violet-400">{command.name}</span>
			<p className="text-sm leading-relaxed text-slate-500">{command.description}</p>
			<span className="font-mono text-xs text-slate-700">{command.usage}</span>
		</div>
	);
}
