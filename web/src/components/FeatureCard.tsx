interface FeatureCardProps {
	icon: string;
	title: string;
	description: string;
	accentClass: string;
}

export function FeatureCard({ icon, title, description, accentClass }: FeatureCardProps) {
	return (
		<div className="group rounded-xl border border-white/[0.06] bg-[#1a1a2e] p-6 transition-all duration-200 hover:border-[#7c3aed]/30">
			<div className={`mb-4 flex h-10 w-10 items-center justify-content-center rounded-xl text-xl ${accentClass}`}>
				{icon}
			</div>
			<h3 className="mb-1.5 text-sm font-bold text-slate-100">{title}</h3>
			<p className="text-sm leading-relaxed text-slate-500">{description}</p>
		</div>
	);
}
