import { container } from "@sapphire/framework";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertArchivedChannelMessage } from "../../../src/db/queries/archivedChannelMessages.js";
import {
	archivedChannelMessages,
	guildPersonalityProfiles,
	guildSettings,
	userMessages,
	userPersonalityProfiles,
} from "../../../src/db/schema.js";
import { db } from "../../../src/lib/database.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";
import { PersonalityCommand } from "../../../src/commands/utility/personality.js";

vi.mock("../../../src/lib/personality/buildProfile.js", () => ({
	buildPersonalityProfile: vi.fn(async () => ({ status: "built" })),
	INITIAL_USER_PROFILE_THRESHOLD: 100,
	REFRESH_USER_PROFILE_THRESHOLD: 20,
}));

vi.mock("../../../src/lib/personality/buildGuildProfile.js", () => ({
	buildGuildPersonalityProfile: vi.fn(async () => ({ status: "built" })),
	INITIAL_GUILD_PROFILE_THRESHOLD: 200,
	REFRESH_GUILD_PROFILE_THRESHOLD: 40,
}));

const GUILD_ID = "pcmd-guild";
const USER_ID = "pcmd-user";
const ADMIN_ID = "pcmd-admin";

const mockedBuildPersonalityProfile = vi.mocked(buildPersonalityProfile);
const mockedBuildGuildPersonalityProfile = vi.mocked(buildGuildPersonalityProfile);

async function cleanupRows(): Promise<void> {
	await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	await db.delete(userPersonalityProfiles).where(eq(userPersonalityProfiles.guildId, GUILD_ID));
	await db.delete(userMessages).where(eq(userMessages.guildId, GUILD_ID));
	await db.delete(guildSettings).where(eq(guildSettings.guildId, GUILD_ID));
}

async function archiveMessages(input: { count: number; authorUserId?: string; idPrefix: string }): Promise<void> {
	for (let index = 0; index < input.count; index++) {
		const paddedIndex = String(index).padStart(3, "0");
		await upsertArchivedChannelMessage({
			guildId: GUILD_ID,
			channelId: GUESS_WHO_CHANNEL_ID,
			authorUserId: input.authorUserId ?? `guild-author-${index % 8}`,
			authorUsername: "archive-user",
			authorDisplayName: "Archive User",
			messageId: `${input.idPrefix}-${paddedIndex}`,
			content: `Archived command evidence ${input.idPrefix} ${paddedIndex} with enough personality context.`,
			messageCreatedAt: new Date(Date.UTC(2026, 4, 29, 12, 0, index)),
		});
	}
}

function createInteraction(input: {
	subcommandGroup: "view" | "refresh";
	subcommand: "user" | "guild";
	isAdmin?: boolean;
	targetUserId?: string;
}) {
	const deferReply = vi.fn(async () => undefined);
	const editReply = vi.fn(async () => undefined);
	const followUp = vi.fn(async () => undefined);
	const targetUser = {
		id: input.targetUserId ?? USER_ID,
		displayName: "Target User",
		username: "target-user",
		toString: () => "<@pcmd-user>",
		displayAvatarURL: () => "https://example.test/avatar.png",
	};
	const interaction = {
		guildId: GUILD_ID,
		user: { id: ADMIN_ID },
		guild: {
			name: "Command Test Server",
			members: {
				fetch: vi.fn(async () => ({ permissions: { has: () => input.isAdmin ?? true } })),
			},
		},
		options: {
			getSubcommandGroup: vi.fn(() => input.subcommandGroup),
			getSubcommand: vi.fn(() => input.subcommand),
			getUser: vi.fn(() => (input.subcommand === "user" ? targetUser : null)),
		},
		deferReply,
		editReply,
		followUp,
	};
	return { interaction: interaction as any, deferReply, editReply, followUp };
}

function lastEmbedDescription(editReply: ReturnType<typeof vi.fn>): string {
	const payload = editReply.mock.calls.at(-1)?.[0] as { embeds?: Array<{ data?: { description?: string } }> };
	return payload.embeds?.[0]?.data?.description ?? "";
}

function lastEmbedTitle(editReply: ReturnType<typeof vi.fn>): string {
	const payload = editReply.mock.calls.at(-1)?.[0] as { embeds?: Array<{ data?: { title?: string } }> };
	return payload.embeds?.[0]?.data?.title ?? "";
}

function lastEmbedFieldValue(editReply: ReturnType<typeof vi.fn>, fieldName: string): string {
	const payload = editReply.mock.calls.at(-1)?.[0] as {
		embeds?: Array<{ data?: { fields?: Array<{ name: string; value: string }> } }>;
	};
	return payload.embeds?.[0]?.data?.fields?.find((field) => field.name === fieldName)?.value ?? "";
}

function createCommand(): PersonalityCommand {
	setupSapphireContainer();
	(container as any).logger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
	return new PersonalityCommand(createCommandContext("src/commands/utility/personality.ts"), {});
}

describe("/personality command", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await cleanupRows();
	});

	it("view user displays the active user profile label in an ephemeral reply", async () => {
		await db.insert(userPersonalityProfiles).values({
			userId: USER_ID,
			guildId: GUILD_ID,
			profile: "Target user writes in dry, concise jokes.",
		});
		const { interaction, deferReply, editReply } = createInteraction({ subcommandGroup: "view", subcommand: "user" });

		await createCommand().chatInputRun(interaction);

		expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
		expect(lastEmbedTitle(editReply)).toContain("User Personality Profile");
		expect(lastEmbedDescription(editReply)).toContain("Target user writes in dry, concise jokes.");
	});

	it("view user reports archive-derived evidence after cursor instead of stale counters", async () => {
		const cursor = new Date("2026-05-29T12:00:00.000Z");
		await db.insert(userPersonalityProfiles).values({
			userId: USER_ID,
			guildId: GUILD_ID,
			profile: "Target user profile.",
			newMessageCount: 999,
			lastTrainingMessageAt: cursor,
			lastTrainingMessageId: "cursor-user",
		});
		await archiveMessages({ count: 2, authorUserId: USER_ID, idPrefix: "user-after" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "view", subcommand: "user" });

		await createCommand().chatInputRun(interaction);

		expect(lastEmbedFieldValue(editReply, "Archived evidence after cursor")).toContain("2 eligible archived message(s)");
		expect(lastEmbedFieldValue(editReply, "Archived evidence after cursor")).not.toContain("999");
	});

	it("view guild displays the active server culture profile label in an ephemeral reply", async () => {
		await db.insert(guildPersonalityProfiles).values({
			guildId: GUILD_ID,
			profile: "This server culture rewards chaotic one-liners.",
		});
		const { interaction, deferReply, editReply } = createInteraction({ subcommandGroup: "view", subcommand: "guild" });

		await createCommand().chatInputRun(interaction);

		expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
		expect(lastEmbedTitle(editReply)).toContain("Server Culture Profile");
		expect(lastEmbedDescription(editReply)).toContain("This server culture rewards chaotic one-liners.");
	});

	it("view guild reports archive-derived evidence after cursor instead of stale counters", async () => {
		const cursor = new Date("2026-05-29T12:00:00.000Z");
		await db.insert(guildPersonalityProfiles).values({
			guildId: GUILD_ID,
			profile: "Server culture profile.",
			messageCount: 999,
			lastTrainingMessageAt: cursor,
			lastTrainingMessageId: "cursor-guild",
		});
		await archiveMessages({ count: 3, idPrefix: "guild-after" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "view", subcommand: "guild" });

		await createCommand().chatInputRun(interaction);

		expect(lastEmbedFieldValue(editReply, "Archived evidence after cursor")).toContain("3 eligible archived message(s)");
		expect(lastEmbedFieldValue(editReply, "Archived evidence after cursor")).not.toContain("999");
	});

	it("refresh user below the archived threshold ignores stale user_messages and reports insufficient archived evidence", async () => {
		await db.insert(userMessages).values({
			userId: USER_ID,
			guildId: GUILD_ID,
			content: "Stale user_messages evidence must not count for command gating.",
		});
		const { interaction, editReply } = createInteraction({ subcommandGroup: "refresh", subcommand: "user" });

		await createCommand().chatInputRun(interaction);

		expect(mockedBuildPersonalityProfile).not.toHaveBeenCalled();
		expect(lastEmbedDescription(editReply)).toContain("Not enough archived training evidence");
		expect(lastEmbedDescription(editReply)).toContain("at least 100");
		expect(lastEmbedDescription(editReply)).not.toMatch(/opt\s*-?in|consent/i);
	});

	it("refresh guild below the archived threshold reports insufficient archived evidence", async () => {
		await archiveMessages({ count: 199, idPrefix: "guild-below" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "refresh", subcommand: "guild" });

		await createCommand().chatInputRun(interaction);

		expect(mockedBuildGuildPersonalityProfile).not.toHaveBeenCalled();
		expect(lastEmbedDescription(editReply)).toContain("Not enough archived training evidence");
		expect(lastEmbedDescription(editReply)).toContain("at least 200");
	});

	it("refresh user starts an incremental archive refresh when threshold conditions allow", async () => {
		await archiveMessages({ count: 100, authorUserId: USER_ID, idPrefix: "user-ready" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "refresh", subcommand: "user" });

		await createCommand().chatInputRun(interaction);

		expect(mockedBuildPersonalityProfile).toHaveBeenCalledWith(USER_ID, GUILD_ID);
		expect(lastEmbedDescription(editReply)).toContain("Incremental refresh completed");
		expect(lastEmbedDescription(editReply)).not.toMatch(/rebuild/i);
	});

	it("refresh user reports when the builder skips due to cooldown", async () => {
		mockedBuildPersonalityProfile.mockResolvedValueOnce({ status: "skipped_cooldown" } as never);
		await archiveMessages({ count: 100, authorUserId: USER_ID, idPrefix: "user-cooldown" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "refresh", subcommand: "user" });

		await createCommand().chatInputRun(interaction);

		expect(mockedBuildPersonalityProfile).toHaveBeenCalledWith(USER_ID, GUILD_ID);
		expect(lastEmbedDescription(editReply)).toContain("Refresh skipped");
		expect(lastEmbedDescription(editReply)).toContain("cooldown");
		expect(lastEmbedDescription(editReply)).not.toContain("Incremental refresh started");
	});

	it("refresh guild starts an incremental archive refresh when threshold conditions allow", async () => {
		await archiveMessages({ count: 200, idPrefix: "guild-ready" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "refresh", subcommand: "guild" });

		await createCommand().chatInputRun(interaction);

		expect(mockedBuildGuildPersonalityProfile).toHaveBeenCalledWith(GUILD_ID);
		expect(lastEmbedDescription(editReply)).toContain("Incremental refresh completed");
		expect(lastEmbedDescription(editReply)).not.toMatch(/rebuild/i);
	});

	it("refresh guild reports when the builder skips due to cooldown", async () => {
		mockedBuildGuildPersonalityProfile.mockResolvedValueOnce({ status: "skipped_cooldown" } as never);
		await archiveMessages({ count: 200, idPrefix: "guild-cooldown" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "refresh", subcommand: "guild" });

		await createCommand().chatInputRun(interaction);

		expect(mockedBuildGuildPersonalityProfile).toHaveBeenCalledWith(GUILD_ID);
		expect(lastEmbedDescription(editReply)).toContain("Refresh skipped");
		expect(lastEmbedDescription(editReply)).toContain("cooldown");
		expect(lastEmbedDescription(editReply)).not.toContain("Incremental refresh started");
	});

	it("reports the operational feature toggle as disabled without opt-in wording", async () => {
		await db.insert(guildSettings).values({ guildId: GUILD_ID, personalityEnabled: false });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "view", subcommand: "user" });

		await createCommand().chatInputRun(interaction);

		expect(lastEmbedDescription(editReply)).toContain("Personality profiling is disabled for this server");
		expect(lastEmbedDescription(editReply)).not.toMatch(/opt\s*-?in|consent/i);
	});
});
