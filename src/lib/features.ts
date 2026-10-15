/**
 * Compile-time feature switches. Flip a flag to `true` to re-enable a subsystem;
 * every wiring point keys off these constants so nothing else needs to change.
 *
 * - PERSONALITY_GENERATION_ENABLED: profile builds. Enforced inside both profile builders,
 *   so every caller (listener threshold trigger, startup backfill, refresh task,
 *   /personality refresh) is covered. Archiving, evidence counting, and viewing existing
 *   profiles stay available.
 */
export const PERSONALITY_GENERATION_ENABLED = false;
