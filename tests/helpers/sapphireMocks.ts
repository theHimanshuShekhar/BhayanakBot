import path from "node:path";
import { AllFlowsPrecondition, Command, container, Listener } from "@sapphire/framework";

export function setupSapphireContainer() {
	(container as any).client = {
		options: {
			defaultCooldown: {
				delay: 0,
				limit: 0,
				scope: 0,
				filteredCommands: [],
				filteredUsers: [],
			},
		},
	};
}

export function createCommandContext(filePath: string): Command.LoaderContext {
	const dir = path.dirname(filePath);
	return {
		store: {} as any,
		path: path.resolve(filePath),
		root: path.resolve(dir),
		name: path.basename(filePath).replace(".ts", "").replace(".js", ""),
	} as Command.LoaderContext;
}

export function createListenerContext(filePath: string): Listener.LoaderContext {
	const dir = path.dirname(filePath);
	return {
		store: {} as any,
		path: path.resolve(filePath),
		root: path.resolve(dir),
		name: path.basename(filePath).replace(".ts", "").replace(".js", ""),
	} as Listener.LoaderContext;
}

export function createPreconditionContext(filePath: string): any {
	const dir = path.dirname(filePath);
	return {
		store: {} as any,
		path: path.resolve(filePath),
		root: path.resolve(dir),
		name: path.basename(filePath).replace(".ts", "").replace(".js", ""),
	};
}

export async function loadCommandClass(filePath: string): Promise<new (...args: any[]) => Command> {
	const mod = await import(filePath);
	const CommandClass = Object.values(mod).find(
		(v): v is new (...args: any[]) => Command => typeof v === "function" && v.prototype instanceof Command,
	);
	if (!CommandClass) {
		throw new Error(`No Command subclass found in ${filePath}`);
	}
	return CommandClass;
}

export async function loadListenerClass(filePath: string): Promise<new (...args: any[]) => Listener> {
	const mod = await import(filePath);
	const ListenerClass = Object.values(mod).find(
		(v): v is new (...args: any[]) => Listener => typeof v === "function" && v.prototype instanceof Listener,
	);
	if (!ListenerClass) {
		throw new Error(`No Listener subclass found in ${filePath}`);
	}
	return ListenerClass;
}

export async function loadPreconditionClass(filePath: string): Promise<new (...args: any[]) => AllFlowsPrecondition> {
	const mod = await import(filePath);
	const PreconditionClass = Object.values(mod).find(
		(v): v is new (...args: any[]) => AllFlowsPrecondition =>
			typeof v === "function" && v.prototype instanceof AllFlowsPrecondition,
	);
	if (!PreconditionClass) {
		throw new Error(`No AllFlowsPrecondition subclass found in ${filePath}`);
	}
	return PreconditionClass;
}
