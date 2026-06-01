import { z } from "zod";

const optionalSnowflake = z
	.string()
	.trim()
	.regex(/^\d{17,20}$/)
	.optional()
	.or(z.literal(""));

const envSchema = z.object({
	NODE_ENV: z.string().optional(),
	DISCORD_TOKEN: z.string().trim().min(1, "DISCORD_TOKEN is required"),
	DATABASE_URL: z.string().trim().url().optional(),
	TARGET_GUILD_ID: optionalSnowflake,
	TARGET_TEXT_CHANNEL_ID: optionalSnowflake,
	GUESS_WHO_CHANNEL_ID: optionalSnowflake,
	BOT_OWNER_ID: optionalSnowflake,
	ZEN_ALLOW_DISCORD_CONTENT: z.enum(["true", "false"]).optional(),
	OLLAMA_MAX_QUEUE_LENGTH: z.coerce.number().int().positive().optional(),
	OLLAMA_MAX_LOW_PRIORITY_QUEUE_LENGTH: z.coerce.number().int().positive().optional(),
	OLLAMA_QUEUE_WAIT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
});

export type RuntimeConfig = z.infer<typeof envSchema>;

export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
	const parsed = envSchema.safeParse(env);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
		throw new Error(`[config] Invalid environment: ${issues}`);
	}

	if (parsed.data.NODE_ENV === "production") {
		const unsafeLocalDb = "postgresql://postgres:postgres@localhost:5432/bhayanakbot";
		if (!parsed.data.DATABASE_URL || parsed.data.DATABASE_URL === unsafeLocalDb) {
			throw new Error("[config] DATABASE_URL must be set to a production-safe value when NODE_ENV=production");
		}
	}

	return parsed.data;
}
