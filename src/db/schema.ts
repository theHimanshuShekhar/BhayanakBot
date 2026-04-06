import { boolean, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

// --- Enums ---

export const autoModActionEnum = pgEnum("auto_mod_action", ["warn", "mute", "kick"]);
export const modCaseTypeEnum = pgEnum("mod_case_type", ["warn", "mute", "unmute", "kick", "ban", "unban", "tempban"]);
export const reactionRoleTypeEnum = pgEnum("reaction_role_type", ["normal", "toggle", "unique"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "closed"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "approved", "denied"]);
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
	ticketCategoryId: varchar("ticket_category_id", { length: 20 }),
	// Roles
	autoRole: varchar("auto_role", { length: 20 }),
	mutedRoleId: varchar("muted_role_id", { length: 20 }),
	ticketSupportRoleId: varchar("ticket_support_role_id", { length: 20 }),
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
	(t) => [primaryKey({ columns: [t.userId, t.guildId] })],
);

export const modCases = pgTable("mod_cases", {
	id: serial("id").primaryKey(),
	caseNumber: integer("case_number").notNull(), // sequential per guild
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	moderatorId: varchar("moderator_id", { length: 20 }).notNull(),
	type: modCaseTypeEnum("type").notNull(),
	reason: text("reason"),
	duration: integer("duration"), // ms, for timed actions
	expiresAt: timestamp("expires_at"),
	active: boolean("active").default(true).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tickets = pgTable("tickets", {
	id: serial("id").primaryKey(),
	channelId: varchar("channel_id", { length: 20 }).notNull(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	subject: text("subject"),
	status: ticketStatusEnum("status").default("open").notNull(),
	claimedBy: varchar("claimed_by", { length: 20 }),
	claimedAt: timestamp("claimed_at"),
	transcriptUrl: text("transcript_url"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	closedAt: timestamp("closed_at"),
	closedBy: varchar("closed_by", { length: 20 }),
});

export const reactionRoles = pgTable(
	"reaction_roles",
	{
		messageId: varchar("message_id", { length: 20 }).notNull(),
		emoji: varchar("emoji", { length: 100 }).notNull(),
		roleId: varchar("role_id", { length: 20 }).notNull(),
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		type: reactionRoleTypeEnum("type").default("normal").notNull(),
		groupId: varchar("group_id", { length: 50 }),
	},
	(t) => [primaryKey({ columns: [t.messageId, t.emoji] })],
);

export const roleMenus = pgTable("role_menus", {
	id: serial("id").primaryKey(),
	messageId: varchar("message_id", { length: 20 }).notNull(),
	channelId: varchar("channel_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	placeholder: varchar("placeholder", { length: 150 }),
	minValues: integer("min_values").default(0).notNull(),
	maxValues: integer("max_values").default(1).notNull(),
});

export const roleMenuOptions = pgTable("role_menu_options", {
	id: serial("id").primaryKey(),
	menuId: integer("menu_id").notNull(),
	roleId: varchar("role_id", { length: 20 }).notNull(),
	label: varchar("label", { length: 100 }).notNull(),
	description: varchar("description", { length: 100 }),
	emoji: varchar("emoji", { length: 100 }),
});

export const levelRewards = pgTable(
	"level_rewards",
	{
		guildId: varchar("guild_id", { length: 20 }).notNull(),
		level: integer("level").notNull(),
		roleId: varchar("role_id", { length: 20 }).notNull(),
	},
	(t) => [primaryKey({ columns: [t.guildId, t.level] })],
);

export const polls = pgTable("polls", {
	id: serial("id").primaryKey(),
	messageId: varchar("message_id", { length: 20 }).notNull(),
	channelId: varchar("channel_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	question: text("question").notNull(),
	options: jsonb("options").notNull(), // { label: string, votes: string[] }[]
	expiresAt: timestamp("expires_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	closed: boolean("closed").default(false).notNull(),
});

export const reminders = pgTable("reminders", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	channelId: varchar("channel_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	message: text("message").notNull(),
	remindAt: timestamp("remind_at").notNull(),
	sent: boolean("sent").default(false).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const giveaways = pgTable("giveaways", {
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
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const starredMessages = pgTable("starred_messages", {
	messageId: varchar("message_id", { length: 20 }).primaryKey(),
	starboardMessageId: varchar("starboard_message_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	starCount: integer("star_count").default(1).notNull(),
});

export const suggestions = pgTable("suggestions", {
	id: serial("id").primaryKey(),
	messageId: varchar("message_id", { length: 20 }).notNull(),
	channelId: varchar("channel_id", { length: 20 }).notNull(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	content: text("content").notNull(),
	status: suggestionStatusEnum("status").default("pending").notNull(),
	response: text("response"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const afkUsers = pgTable("afk_users", {
	userId: varchar("user_id", { length: 20 }).notNull(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	reason: text("reason"),
	setAt: timestamp("set_at").defaultNow().notNull(),
});

export const autoResponses = pgTable("auto_responses", {
	id: serial("id").primaryKey(),
	guildId: varchar("guild_id", { length: 20 }).notNull(),
	trigger: text("trigger").notNull(),
	response: text("response").notNull(),
	matchType: autoResponseMatchTypeEnum("match_type").default("contains").notNull(),
	responseType: autoResponseTypeEnum("response_type").default("static").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- RPG Module ---

export const rpgProfiles = pgTable("rpg_profiles", {
	userId: varchar("user_id", { length: 20 }).primaryKey(),
	coins: integer("coins").default(0).notNull(),
	level: integer("level").default(1).notNull(),
	xp: integer("xp").default(0).notNull(),
	jailUntil: timestamp("jail_until"),
	jailBailCost: integer("jail_bail_cost"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rpgStats = pgTable("rpg_stats", {
	userId: varchar("user_id", { length: 20 }).primaryKey(),
	strength: integer("strength").default(1).notNull(),
	intelligence: integer("intelligence").default(1).notNull(),
	agility: integer("agility").default(1).notNull(),
	charisma: integer("charisma").default(1).notNull(),
	luck: integer("luck").default(1).notNull(),
	strTrainedAt: timestamp("str_trained_at"),
	intTrainedAt: timestamp("int_trained_at"),
	agiTrainedAt: timestamp("agi_trained_at"),
	chaTrainedAt: timestamp("cha_trained_at"),
	lukTrainedAt: timestamp("luk_trained_at"),
});

export const rpgCooldowns = pgTable(
	"rpg_cooldowns",
	{
		userId: varchar("user_id", { length: 20 }).notNull(),
		action: varchar("action", { length: 50 }).notNull(),
		expiresAt: timestamp("expires_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.action] })],
);

export const rpgInventory = pgTable("rpg_inventory", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	itemId: varchar("item_id", { length: 50 }).notNull(),
	quantity: integer("quantity").default(1).notNull(),
	equippedSlot: varchar("equipped_slot", { length: 30 }),
});

export const rpgOwnedPets = pgTable("rpg_owned_pets", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 20 }).notNull(),
	petId: varchar("pet_id", { length: 50 }).notNull(),
	nickname: varchar("nickname", { length: 32 }),
	acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
});

export const rpgOwnedProperties = pgTable(
	"rpg_owned_properties",
	{
		id: serial("id").primaryKey(),
		userId: varchar("user_id", { length: 20 }).notNull(),
		propertyId: varchar("property_id", { length: 50 }).notNull(),
		purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
		lastCollectedAt: timestamp("last_collected_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.userId, t.propertyId)],
);
