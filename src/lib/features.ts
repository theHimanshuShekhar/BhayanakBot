/**
 * Compile-time feature switches. Flip a flag to `true` to re-enable a subsystem;
 * every wiring point keys off these constants so nothing else needs to change.
 *
 * - LOCAL_LLM_ENABLED: Ollama startup warmup and the local fallback in llmProvider.
 *   When false, autoresponder and summarize run remote-API (Zen) only.
 * - PERSONALITY_GENERATION_ENABLED: profile builds. Enforced inside both profile builders,
 *   so every caller (listener threshold trigger, startup backfill, refresh task,
 *   /personality refresh) is covered. Archiving, evidence counting, and viewing existing
 *   profiles stay available.
 */
export const LOCAL_LLM_ENABLED = false;
export const PERSONALITY_GENERATION_ENABLED = false;

/** True when `filePath` belongs to a piece whose feature is switched off. */
export function isPieceDisabled(filePath: string): boolean {
	const normalized = filePath.replaceAll("\\", "/");

	if (!PERSONALITY_GENERATION_ENABLED && normalized.endsWith("/scheduled-tasks/refreshPersonalityProfiles.ts")) {
		return true;
	}

	return false;
}
