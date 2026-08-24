/**
 * Compile-time feature switches. Flip a flag to `true` to re-enable a subsystem;
 * every wiring point keys off these constants so nothing else needs to change.
 *
 * - RPG_ENABLED: /commands/rpg/*, rpg interaction handlers, daily quest task.
 * - LOCAL_LLM_ENABLED: Ollama startup warmup and the local fallback in llmProvider.
 *   When false, autoresponder and summarize run remote-API (Zen) only.
 * - PERSONALITY_GENERATION_ENABLED: profile builds (startup backfill, refresh task,
 *   /personality refresh). Viewing existing profiles stays available.
 */
export const RPG_ENABLED = false;
export const LOCAL_LLM_ENABLED = false;
export const PERSONALITY_GENERATION_ENABLED = false;

/** True when `filePath` belongs to a piece whose feature is switched off. */
export function isPieceDisabled(filePath: string): boolean {
	const normalized = filePath.replaceAll("\\", "/");

	if (!RPG_ENABLED) {
		if (normalized.includes("/commands/rpg/")) return true;
		if (
			normalized.endsWith("/interaction-handlers/rpgJailActions.ts") ||
			normalized.endsWith("/interaction-handlers/rpgShopPage.ts") ||
			normalized.endsWith("/scheduled-tasks/generateDailyQuests.ts")
		) {
			return true;
		}
	}

	if (!PERSONALITY_GENERATION_ENABLED && normalized.endsWith("/scheduled-tasks/refreshPersonalityProfiles.ts")) {
		return true;
	}

	return false;
}
