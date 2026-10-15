import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	varchar,
} from "drizzle-orm/pg-core";

// --- Enums ---

export const autoModActionEnum = pgEnum("auto_mod_action", ["warn", "mute", "kick"]);
export const modCaseTypeEnum = pgEnum("mod_case_type", ["warn", "mute", "unmute", "kick", "ban", "unban", "tempban"]);
export const autoResponseMatchTypeEnum = pgEnum("auto_response_match_type", ["exact", "contains", "startsWith"]);
export const autoResponseTypeEnum = pgEnum("auto_response_type", ["static", "llm"]);

// --- Tables ---

export const guildSettings = pgTable("guild_settings", {
	guildId: varchar("guild_id", { length: 20 }).primaryKey(),
	// Channels
	welcomeChannelId: varchar("welcome_channel_id", { length: 20 }),
	goodbyeChannelId: varchar("goodbye_channel_id", { length: 20 }),
	logChannelId: varchar("log_channel_id", { length: 20 }),
	levelUpChannelId: varchar("level_up_channel_id", { length: 20 }),
	musicChannelId: varchar("music_channel_id", { length: 20 }),
	starboardChannelId: varchar("starboard_channel_id", { length: 20 }),
	// Roles
	autoRole: varchar("auto_role", { length: 20 }),
	mutedRoleId: varchar("muted_role_id", { length: 20 }),
	djRoleId: varchar("dj_role_id", { length: 20 }),
	moderatorRoleId: varchar("moderator_role_id", { length: 20 }),
	// Messages
	welcomeMessage: text("welcome_message"),
	goodbyeMessage: text("goodbye_message"),
	levelUpMessage: text("level_up_message"),
	// Starboard
	starThreshold: integer("star_threshold").default(3).notNull(),
	// XP
	xpRate: integer("xp_rate").default(15).notNull(),
	xpCooldownSeconds: integer("xp_cooldown_seconds").default(60).notNull(),
	// Auto-mod
	autoModEnabled: boolean("auto_mod_enabled").default(false).notNull(),
	autoModSpamThreshold: integer("auto_mod_spam_threshold").default(5),
	autoModBadLinks: boolean("auto_mod_bad_links").default(false).notNull(),
	autoModMaxMentions: integer("auto_mod_max_mentions").default(5),
	autoModAction: autoModActionEnum("auto_mod_action").default("warn"),
	autoModMuteDuration: integer("auto_mod_mute_duration").default(300000), // ms
	// Anti-raid
	antiRaidEnabled: boolean("anti_raid_enabled").default(false).notNull(),
	antiRaidJoinThreshold: integer("anti_raid_join_threshold").default(10),
	antiRaidJoinWindow: integer("anti_raid_join_window").default(10), // seconds
	// Personality features
	personalityEnabled: boolean("personality_enabled").default(true).notNull(),
	// Random chat responder
	randomResponseChannelId: varchar("random_response_channel_id", { length: 20 }),
	randomResponseChance: integer("random_response_chance").default(0).notNull(),
});

export const botCommandCounters = pgTable("bot_command_counters", {
	name: varchar("name", { length: 50 }).primaryKey(),
	commandsRun: integer("commands_run").default(0).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const publicBotStatsSnapshots = pgTable("public_bot_stats_snapshots", {
	name: varchar("name", { length: 50 }).primaryKey(),
	guilds: integer("guilds").default(0).notNull(),
	commandsRun: integer("commands_run").default(0).notNull(),
	latencyMs: integer("latency_ms"),
	capturedAt: timestamp("captured_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dashboardPresenceSnapshots = pgTable("dashboard_presence_snapshots", {
	name: varchar("name", { length: 50 }).primaryKey(),
	payload: jsonb("payload").notNull(),
	capturedAt: timestamp("captured_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable(
	"users",
	{
		userId: varchar("user_id", { length: 20 }).notNull(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		xp: integer("xp").default(0).notNull(),
		level: integer("level").default(0).notNull(),
		totalMessages: integer("total_messages").default(0).notNull(),
		lastMessageAt: timestamp("last_message_at"),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.guildId] }),
		// getLeaderboard: one guild's members by XP.
		index("users_guild_xp_idx").on(t.guildId, t.xp.desc().nullsFirst()),
	],
);

export const modCases = pgTable(
	"mod_cases",
	{
		id: serial("id").primaryKey(),
		caseNumber: integer("case_number").notNull(), // sequential per guild
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		userId: varchar("user_id", { length: 20 }).notNull(),
		moderatorId: varchar("moderator_id", { length: 20 }).notNull(),
		type: modCaseTypeEnum("type").notNull(),
		reason: text("reason"),
		duration: bigint("duration", { mode: "number" }), // ms, for timed actions; a 1 year cap overflows int4
		expiresAt: timestamp("expires_at"),
		active: boolean("active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		unique("mod_cases_guild_id_case_number_unique").on(t.guildId, t.caseNumber),
		// getUserCases / findRecentCase: one member's cases, newest first.
		index("mod_cases_guild_user_created_idx").on(t.guildId, t.userId, t.createdAt),
		// getExpiredActiveCases (30s expiry tasks): only active cases are ever scanned.
		index("mod_cases_active_expiry_idx").on(t.type, t.expiresAt).where(sql`${t.active} = true`),
	],
);

export const levelRewards = pgTable(
	"level_rewards",
	{
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		level: integer("level").notNull(),
		roleId: varchar("role_id", { length: 20 }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.guildId, t.level] })],
);

export const polls = pgTable(
	"polls",
	{
		id: serial("id").primaryKey(),
		messageId: varchar("message_id", { length: 20 }).notNull(),
		channelId: varchar("channel_id", { length: 20 }).notNull(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		question: text("question").notNull(),
		options: jsonb("options").notNull(), // { label: string, votes: string[] }[]
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		closed: boolean("closed").default(false).notNull(),
	},
	(t) => [
		unique("polls_message_id_unique").on(t.messageId),
		// getActiveExpiredPolls (30s task): only open polls are ever scanned.
		index("polls_open_expires_idx").on(t.expiresAt).where(sql`${t.closed} = false`),
	],
);

export const reminders = pgTable(
	"reminders",
	{
		id: serial("id").primaryKey(),
		userId: varchar("user_id", { length: 20 }).notNull(),
		channelId: varchar("channel_id", { length: 20 }).notNull(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		message: text("message").notNull(),
		remindAt: timestamp("remind_at").notNull(),
		sent: boolean("sent").default(false).notNull(),
		// Delivery retries: failed deliveries are retried at nextAttemptAt, and abandoned (failed) after the retry window.
		attempts: integer("attempts").default(0).notNull(),
		nextAttemptAt: timestamp("next_attempt_at"),
		failed: boolean("failed").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		// getPendingReminders (30s task): only reminders still waiting for delivery are ever scanned.
		index("reminders_pending_remind_at_idx").on(t.remindAt).where(sql`${t.sent} = false and ${t.failed} = false`),
	],
);

export const giveaways = pgTable(
	"giveaways",
	{
		id: serial("id").primaryKey(),
		messageId: varchar("message_id", { length: 20 }).notNull(),
		channelId: varchar("channel_id", { length: 20 }).notNull(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		prize: text("prize").notNull(),
		winnerCount: integer("winner_count").default(1).notNull(),
		endsAt: timestamp("ends_at").notNull(),
		ended: boolean("ended").default(false).notNull(),
		hostId: varchar("host_id", { length: 20 }).notNull(),
		winners: jsonb("winners").$type<string[]>().default([]).notNull(),
		entries: jsonb("entries").$type<string[]>().default([]).notNull(),
		// Ending decides the winners; announced is set once the result is posted (or abandoned after repeated failures).
		announced: boolean("announced").default(false).notNull(),
		announceAttempts: integer("announce_attempts").default(0).notNull(),
		announceAttemptedAt: timestamp("announce_attempted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		unique("giveaways_message_id_unique").on(t.messageId),
		// getActiveExpiredGiveaways (30s task): only running giveaways are ever scanned.
		index("giveaways_running_ends_at_idx").on(t.endsAt).where(sql`${t.ended} = false`),
		// getGiveawaysAwaitingAnnouncement (30s task): ended giveaways whose result is still unposted.
		index("giveaways_unannounced_attempted_idx")
			.on(t.announceAttemptedAt)
			.where(sql`${t.ended} = true and ${t.announced} = false`),
	],
);

export const starredMessages = pgTable("starred_messages", {
	messageId: varchar("message_id", { length: 20 }).primaryKey(),
	starboardMessageId: varchar("starboard_message_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	starCount: integer("star_count").default(1).notNull(),
});

export const archivedChannelMessages = pgTable(
	"archived_channel_messages",
	{
		messageId: varchar("message_id", { length: 20 }).primaryKey(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		channelId: varchar("channel_id", { length: 20 }).notNull(),
		authorUserId: varchar("author_user_id", { length: 20 }).notNull(),
		authorUsername: varchar("author_username", { length: 100 }).notNull(),
		authorDisplayName: varchar("author_display_name", { length: 100 }).notNull(),
		content: text("content").notNull(),
		messageCreatedAt: timestamp("message_created_at").notNull(),
		archivedAt: timestamp("archived_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
		editedAt: timestamp("edited_at"),
		deletedAt: timestamp("deleted_at"),
	},
	(t) => [
		index("archived_messages_timeline_idx").on(t.guildId, t.channelId, t.messageCreatedAt),
		index("archived_messages_author_timeline_idx").on(t.guildId, t.channelId, t.authorUserId, t.messageCreatedAt),
		index("archived_messages_game_idx").on(t.guildId, t.channelId, t.deletedAt, t.messageCreatedAt),
		index("archived_messages_personality_user_idx").on(
			t.guildId,
			t.authorUserId,
			t.deletedAt,
			t.messageCreatedAt,
			t.messageId,
		),
		index("archived_messages_personality_guild_idx").on(
			t.guildId,
			t.deletedAt,
			t.messageCreatedAt,
			t.messageId,
			t.authorUserId,
		),
	],
);

export const afkUsers = pgTable(
	"afk_users",
	{
		userId: varchar("user_id", { length: 20 }).notNull(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		reason: text("reason"),
		setAt: timestamp("set_at").defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.guildId] })],
);

export const autoResponses = pgTable(
	"auto_responses",
	{
		id: serial("id").primaryKey(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		trigger: text("trigger").notNull(),
		response: text("response").notNull(),
		matchType: autoResponseMatchTypeEnum("match_type").default("contains").notNull(),
		responseType: autoResponseTypeEnum("response_type").default("static").notNull(),
		useRegex: boolean("use_regex").default(false).notNull(),
		channelIds: jsonb("channel_ids").$type<string[]>().default([]).notNull(), // empty = all channels
		requireMention: boolean("require_mention").default(false).notNull(),
		chancePercent: integer("chance_percent").default(100).notNull(), // 0-100
		deleteTrigger: boolean("delete_trigger").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		// getGuildAutoResponses and the trigger lookups: one guild's responses.
		index("auto_responses_guild_idx").on(t.guildId),
	],
);

// --- Personality Profiling ---

export const userPersonalityProfiles = pgTable(
	"user_personality_profiles",
	{
		userId: varchar("user_id", { length: 20 }).notNull(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		profile: text("profile"),
		newMessageCount: integer("new_message_count").default(0).notNull(),
		lastRefreshedAt: timestamp("last_refreshed_at"),
		lastTrainingMessageAt: timestamp("last_training_message_at"),
		lastTrainingMessageId: varchar("last_training_message_id", { length: 20 }),
	},
	(t) => [primaryKey({ columns: [t.userId, t.guildId] })],
);

export const guildPersonalityProfiles = pgTable("guild_personality_profiles", {
	guildId: varchar("guild_id", { length: 20 }).primaryKey(),
	profile: text("profile"),
	messageCount: integer("message_count").default(0).notNull(),
	lastRefreshedAt: timestamp("last_refreshed_at"),
	lastTrainingMessageAt: timestamp("last_training_message_at"),
	lastTrainingMessageId: varchar("last_training_message_id", { length: 20 }),
});
