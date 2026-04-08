import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export function Navbar() {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const navigate = useNavigate();
	const routerState = useRouterState();
	const isCommandsPage = routerState.location.pathname.startsWith("/commands");

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				inputRef.current?.focus();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	// Sync query from URL when on commands page
	useEffect(() => {
		const url = new URL(window.location.href);
		const q = url.searchParams.get("q") ?? "";
		setQuery(q);
	}, [routerState.location.search]);

	const handleSearch = (value: string) => {
		setQuery(value);
		void navigate({
			to: "/commands/$category",
			params: { category: "all" },
			search: value ? { q: value } : {},
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			setQuery("");
			inputRef.current?.blur();
			if (isCommandsPage) {
				void navigate({
					to: "/commands/$category",
					params: { category: "all" },
					search: {},
				});
			}
		}
	};

	return (
		<nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#0d0d1a]/80 px-6 backdrop-blur-md">
			{/* Logo */}
			<Link to="/" className="flex items-center gap-2.5 no-underline">
				<div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#4f46e5]" />
				<span className="text-sm font-bold tracking-wide text-slate-100">BhayanakBot</span>
			</Link>

			{/* Nav links */}
			<div className="flex items-center gap-6">
				<Link
					to="/"
					className="text-sm text-slate-400 no-underline transition-colors hover:text-slate-200 [&.active]:font-semibold [&.active]:text-violet-400"
				>
					Home
				</Link>
				<Link
					to="/commands/$category"
					params={{ category: "all" }}
					className="text-sm text-slate-400 no-underline transition-colors hover:text-slate-200 [&.active]:font-semibold [&.active]:text-violet-400"
					activeOptions={{ exact: false }}
				>
					Commands
				</Link>
				<a
					href="https://github.com/theHimanshuShekhar/BhayanakBot"
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm text-slate-400 no-underline transition-colors hover:text-slate-200"
				>
					GitHub
				</a>
			</div>

			{/* Search */}
			<div
				className={`flex w-56 items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${
					isCommandsPage && query
						? "border-[#7c3aed]/60 bg-[#1e1b4b]/60"
						: "border-[#7c3aed]/20 bg-[#1e1b4b]/30"
				}`}
			>
				<svg className="h-3.5 w-3.5 shrink-0 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
				</svg>
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => handleSearch(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder='Search commands…'
					className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
				/>
				<kbd className="hidden shrink-0 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[10px] text-slate-500 sm:block">
					⌘K
				</kbd>
			</div>
		</nav>
	);
}
