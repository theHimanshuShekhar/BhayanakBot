import { container } from "@sapphire/framework";
import type { TrainingMessage } from "../../db/queries/personalityTraining.js";
import { callBackgroundLlm } from "../llmProvider.js";
import { fitProfileToCap, MAX_PROFILE_CHARS } from "./profileSize.js";
import { quotesSource } from "./quoteGuard.js";
import { NO_QUOTE_RETRY_INSTRUCTION, wrapSourceMessages } from "./sourcePrompt.js";

const MIN_BUILD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export type PersonalityBuildStatus =
	| "built"
	| "skipped_cooldown"
	| "skipped_in_progress"
	| "skipped_insufficient_evidence"
	| "skipped_model_empty"
	| "skipped_quoted_source";

export interface PersonalityBuildResult {
	status: PersonalityBuildStatus;
}

/** The stored profile row, as the builder needs it. `profile` is null for a row that only holds a cooldown stamp. */
export interface StoredProfileState {
	profile: string | null;
	lastRefreshedAt: Date | null;
	cursorAt: Date | null;
	cursorId: string | null;
}

/** What goes into the prompt, and which fetched messages the archive cursor moves past on success. */
export interface ProfileSource {
	/** Message lines for the prompt, one per line. */
	block: string;
	/** Raw message texts shown to the model; the quote guard compares the profile against these. */
	sources: string[];
	/** Messages absorbed by this build; the cursor advances to the last one. */
	absorbed: TrainingMessage[];
}

/** Everything that differs between a user profile and a server profile. The flow itself is shared. */
export interface ProfileKind {
	/** "user" or "guild"; appears in logs and the Zen request label. */
	kind: "user" | "guild";
	/** One build per key at a time, so concurrent callers do not race on the same archive cursor. */
	lockKey: string;
	/** Ids for log lines, e.g. `userId=1 guildId=2`. Never message content. */
	subject: string;
	/** Zen provider session, e.g. `profile:user:<guildId>:<userId>`. */
	session: string;
	initialThreshold: number;
	refreshThreshold: number;
	systemPrompt: string;
	/** Heading above the messages of a first build, and the sentence that asks for the profile. */
	initialHeading: string;
	initialInstruction: string;
	/** Heading above the existing profile, and above the new messages, in a refresh. */
	existingHeading: string;
	newMessagesHeading: string;
	loadState(): Promise<StoredProfileState>;
	/** Eligible messages after the cursor, oldest first. `threshold` is the evidence the build needs. */
	fetchMessages(state: StoredProfileState, threshold: number): Promise<TrainingMessage[]>;
	/** Chooses the prompt lines from the fetched messages; null when nothing fits. */
	selectSource(messages: TrainingMessage[]): ProfileSource | null;
	/** Stamps lastRefreshedAt without touching the profile or cursor (starts the cooldown after a failed build). */
	touchLastRefreshed(refreshedAt: Date): Promise<void>;
	/** Stores the profile and advances the archive cursor in one statement, so they never disagree. */
	save(profile: string, refreshedAt: Date, cursor: TrainingMessage): Promise<void>;
}

/** Prompt sentence appended to both the first-build and the refresh request. */
export const PROFILE_SIZE_INSTRUCTION = `The profile must be at most ${MAX_PROFILE_CHARS.toLocaleString("en-US")} characters in total. Write compact, specific prose, not bullet points.`;

const REFRESH_INSTRUCTION = `Rewrite the profile in place so it reflects the new messages: keep what still holds, revise what the new messages change, and drop the least important detail to make room. Return the complete new profile, not an addition to the old one. ${PROFILE_SIZE_INSTRUCTION}`;

const buildsInProgress = new Set<string>();

/**
 * Builds or refreshes one personality profile from archived messages. Both profile kinds run this flow:
 * check the evidence threshold and the cooldown, ask the model, apply the size cap and the quote guard (one
 * retry), then store the profile and advance the archive cursor together. A failed build keeps the previous
 * profile and only starts the cooldown.
 */
export async function buildProfile(kind: ProfileKind): Promise<PersonalityBuildResult> {
	container.logger.debug(`[personality] build requested kind=${kind.kind} ${kind.subject}`);
	if (buildsInProgress.has(kind.lockKey)) {
		container.logger.debug(`[personality] build skip kind=${kind.kind} ${kind.subject} reason=in-progress`);
		return { status: "skipped_in_progress" };
	}
	buildsInProgress.add(kind.lockKey);
	const startedAt = Date.now();
	try {
		const result = await buildUnguarded(kind);
		container.logger.debug(
			`[personality] build finished kind=${kind.kind} ${kind.subject} status=${result.status} durationMs=${Date.now() - startedAt}`,
		);
		return result;
	} finally {
		buildsInProgress.delete(kind.lockKey);
	}
}

async function buildUnguarded(kind: ProfileKind): Promise<PersonalityBuildResult> {
	const log = `kind=${kind.kind} ${kind.subject}`;
	const state = await kind.loadState();
	const existingProfile = state.profile;
	const threshold = existingProfile ? kind.refreshThreshold : kind.initialThreshold;

	const messages = await kind.fetchMessages(state, threshold);
	container.logger.debug(
		`[personality] evidence ${log} mode=${existingProfile ? "refresh" : "initial"} threshold=${threshold} fetched=${messages.length}`,
	);
	if (messages.length < threshold) {
		container.logger.debug(`[personality] build skip ${log} reason=insufficient-evidence`);
		return { status: "skipped_insufficient_evidence" };
	}

	// Cooldown: do not hammer the LLM provider after a failed build.
	if (state.lastRefreshedAt && Date.now() - state.lastRefreshedAt.getTime() < MIN_BUILD_INTERVAL_MS) {
		container.logger.debug(`[personality] build skip ${log} reason=cooldown`);
		return { status: "skipped_cooldown" };
	}

	const source = kind.selectSource(messages);
	const newestAbsorbed = source?.absorbed.at(-1);
	if (!source || !newestAbsorbed) {
		container.logger.debug(`[personality] build skip ${log} reason=message-block-empty fetched=${messages.length}`);
		return { status: "skipped_insufficient_evidence" };
	}
	container.logger.debug(
		`[personality] prompt-evidence ${log} absorbed=${source.absorbed.length} lines=${source.sources.length} blockLength=${source.block.length}`,
	);

	const userPrompt = existingProfile
		? [
				kind.existingHeading,
				existingProfile,
				"",
				kind.newMessagesHeading,
				wrapSourceMessages(source.block),
				"",
				REFRESH_INSTRUCTION,
			].join("\n")
		: [kind.initialHeading, wrapSourceMessages(source.block), "", kind.initialInstruction].join("\n");

	const generate = async (prompt: string, label: string): Promise<string | null> => {
		const raw = await callBackgroundLlm(kind.systemPrompt, prompt, "personality", { session: kind.session, label });
		if (!raw) return null;
		const fitted = fitProfileToCap(raw);
		if (fitted !== raw.trim()) {
			container.logger.debug(
				`[personality] size cap ${log} rawLength=${raw.length} keptLength=${fitted?.length ?? 0} cap=${MAX_PROFILE_CHARS}`,
			);
		}
		return fitted;
	};

	let result = await generate(userPrompt, `personality:${kind.kind}`);
	if (!result) {
		container.logger.warn(`[personality] model returned no usable profile ${log}, keeping the previous one`);
		await kind.touchLastRefreshed(new Date());
		return { status: "skipped_model_empty" };
	}

	if (quotesSource(result, source.sources)) {
		container.logger.warn(
			`[personality] profile quoted source text, retrying once ${log} sources=${source.sources.length}`,
		);
		result = await generate(`${userPrompt}\n\n${NO_QUOTE_RETRY_INSTRUCTION}`, `personality:${kind.kind}:retry`);
		if (!result || quotesSource(result, source.sources)) {
			// Keep the previous profile and leave the cursor alone so the same messages are reconsidered once
			// the cooldown passes; lastRefreshedAt stops an immediate repeat.
			container.logger.warn(
				`[personality] profile rejected: quoted source text ${log} sources=${source.sources.length} retry=${result ? "quoted" : "no-result"}`,
			);
			await kind.touchLastRefreshed(new Date());
			return { status: "skipped_quoted_source" };
		}
	}

	await kind.save(result, new Date(), newestAbsorbed);
	container.logger.debug(
		`[personality] profile updated ${log} absorbed=${source.absorbed.length}/${messages.length} profileLength=${result.length}`,
	);
	return { status: "built" };
}
