import { createFileRoute, Link } from "@tanstack/react-router";
import { FeatureCard } from "../components/FeatureCard.js";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

const FEATURES = [
	{ icon: "⚔️", title: "RPG Economy", description: "Full RPG system with jobs, crime, pets, properties, jail, and AI-narrated outcomes via Ollama.", accentClass: "bg-violet-500/10" },
	{ icon: "🎵", title: "Music Player", description: "YouTube, Spotify, and SoundCloud playback with queue management, shuffle, loop, and volume control.", accentClass: "bg-indigo-500/10" },
	{ icon: "🛡️", title: "Moderation", description: "Ban, kick, mute, and warn with per-guild case tracking, history, and anti-spam auto-mod.", accentClass: "bg-cyan-500/10" },
	{ icon: "📈", title: "Leveling", description: "XP progression, rank cards, server leaderboard, and configurable role rewards per level.", accentClass: "bg-emerald-500/10" },
	{ icon: "🎉", title: "Giveaways & Polls", description: "Run timed giveaways with reroll support and interactive polls with live participation tracking.", accentClass: "bg-pink-500/10" },
	{ icon: "🎫", title: "Tickets & Roles", description: "Support ticket panels, reaction roles, and dropdown role menus — all fully configurable per server.", accentClass: "bg-orange-500/10" },
];

function LandingPage() {
	return (
		<main>
			{/* Hero */}
			<section className="relative overflow-hidden px-6 pb-20 pt-24 text-center">
				<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(79,70,229,0.12),transparent)]" />
				<div className="relative mx-auto max-w-2xl">
					<span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-violet-400">
						⚡ Discord Bot
					</span>
					<h1 className="mb-5 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
						The Most{" "}
						<span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
							Bhayanak
						</span>
						<br />
						Bot for Your Server
					</h1>
					<p className="mx-auto mb-9 max-w-lg text-lg leading-relaxed text-slate-400">
						RPG economy, music, moderation, leveling, giveaways, and more — all in one powerful Discord bot.
					</p>
					<div className="flex justify-center gap-3">
						<a
							href="https://discord.com/oauth2/authorize"
							className="rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] px-6 py-2.5 text-sm font-semibold text-white no-underline shadow-lg shadow-violet-900/30 transition-opacity hover:opacity-90"
						>
							Add to Discord
						</a>
						<Link
							to="/commands/$category"
							params={{ category: "all" }}
							className="rounded-lg border border-[#7c3aed]/40 px-6 py-2.5 text-sm font-semibold text-violet-400 no-underline transition-colors hover:border-[#7c3aed]/70 hover:text-violet-300"
						>
							Browse Commands →
						</Link>
					</div>
				</div>
			</section>

			{/* Stats bar */}
			<div className="border-y border-white/[0.05] bg-white/[0.02]">
				<div className="mx-auto flex max-w-3xl justify-center gap-12 px-6 py-7">
					{[
						{ value: "52", label: "Commands" },
						{ value: "12", label: "Categories" },
						{ value: "RPG", label: "Economy System" },
						{ value: "AI", label: "Powered Narration" },
					].map(({ value, label }) => (
						<div key={label} className="text-center">
							<div className="text-2xl font-extrabold text-violet-400">{value}</div>
							<div className="mt-0.5 text-[11px] uppercase tracking-widest text-slate-600">{label}</div>
						</div>
					))}
				</div>
			</div>

			{/* Features */}
			<section className="mx-auto max-w-5xl px-6 py-20">
				<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[#7c3aed]">What it does</p>
				<h2 className="mb-2 text-3xl font-extrabold">Everything your server needs</h2>
				<p className="mb-12 text-slate-500">One bot. No compromises.</p>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{FEATURES.map((f) => (
						<FeatureCard key={f.title} {...f} />
					))}
				</div>
			</section>

			{/* CTA */}
			<section className="border-t border-[#7c3aed]/15 bg-gradient-to-br from-[#7c3aed]/08 to-[#4f46e5]/08 px-6 py-20 text-center">
				<h2 className="mb-3 text-3xl font-extrabold">Ready to power up your server?</h2>
				<p className="mb-8 text-slate-500">Free to use. No credit card required.</p>
				<a
					href="https://discord.com/oauth2/authorize"
					className="inline-block rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#4f46e5] px-8 py-3 text-sm font-semibold text-white no-underline shadow-lg shadow-violet-900/30 transition-opacity hover:opacity-90"
				>
					Add BhayanakBot to Discord
				</a>
			</section>

			{/* Footer */}
			<footer className="border-t border-white/[0.05] px-6 py-6 text-center text-sm text-slate-600">
				© 2026 BhayanakBot ·{" "}
				<a
					href="https://github.com/theHimanshuShekhar/BhayanakBot"
					target="_blank"
					rel="noopener noreferrer"
					className="text-violet-600 no-underline hover:text-violet-400"
				>
					GitHub
				</a>
			</footer>
		</main>
	);
}
