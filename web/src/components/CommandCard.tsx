import type { Command } from "../data/commands.js";

interface CommandCardProps {
	command: Command;
	highlighted?: boolean;
	dimmed?: boolean;
}

export function CommandCard({ command, highlighted, dimmed }: CommandCardProps) {
	const subNames = command.subcommands ? Object.keys(command.subcommands) : [];

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
			<span className="font-mono text-xl font-semibold text-violet-400">{command.name}</span>
			<p className="text-lg leading-relaxed text-slate-400">{command.description}</p>
			{subNames.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{subNames.map((sub) => (
						<span key={sub} className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-base text-slate-500">
							{sub}
						</span>
					))}
				</div>
			)}
			{command.examples[0] && (
				<span className="font-mono text-base text-slate-600">{command.examples[0]}</span>
			)}
			{command.usageNotes && (
				<span className="text-base italic text-slate-500">{command.usageNotes}</span>
			)}
		</div>
	);
}
