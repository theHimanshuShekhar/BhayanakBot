import { container } from "@sapphire/framework";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalityCommand } from "../../../src/commands/utility/personality.js";
import {
	archivedChannelMessages,
	guildPersonalityProfiles,
	guildSettings,
	userPersonalityProfiles,
} from "../../../src/db/schema.js";
import { GUESS_WHO_CHANNEL_ID } from "../../../src/lib/constants.js";
import { db } from "../../../src/lib/database.js";
import { invalidateGuildSettings } from "../../../src/lib/music/guildSettingsCache.js";
import { buildGuildPersonalityProfile } from "../../../src/lib/personality/buildGuildProfile.js";
import { buildPersonalityProfile } from "../../../src/lib/personality/buildProfile.js";
import { seedArchivedMessages } from "../../helpers/archive.js";
import { createCommandContext, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

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
const MEMBER_ID = "pcmd-member";

const mockedBuildPersonalityProfile = vi.mocked(buildPersonalityProfile);
const mockedBuildGuildPersonalityProfile = vi.mocked(buildGuildPersonalityProfile);

async function cleanupRows(): Promise<void> {
	await db.delete(archivedChannelMessages).where(eq(archivedChannelMessages.guildId, GUILD_ID));
	await db.delete(guildPersonalityProfiles).where(eq(guildPersonalityProfiles.guildId, GUILD_ID));
	await db.delete(userPersonalityProfiles).where(eq(userPersonalityProfiles.guildId, GUILD_ID));
	await db.delete(guildSettings).where(eq(guildSettings.guildId, GUILD_ID));
	invalidateGuildSettings(GUILD_ID);
}

async function archiveMessages(input: { count: number; authorUserId?: string; idPrefix: string }): Promise<void> {
	await seedArchivedMessages(
		Array.from({ length: input.count }, (_, index) => {
			const paddedIndex = String(index).padStart(3, "0");
			return {
				guildId: GUILD_ID,
				channelId: GUESS_WHO_CHANNEL_ID,
				authorUserId: input.authorUserId ?? `guild-author-${index % 8}`,
				authorUsername: "archive-user",
				authorDisplayName: "Archive User",
				messageId: `${input.idPrefix}-${paddedIndex}`,
				content: `Archived command evidence ${input.idPrefix} ${paddedIndex} with enough personality context.`,
				messageCreatedAt: new Date(Date.UTC(2026, 4, 29, 12, 0, index)),
			};
		}),
	);
}

function createInteraction(input: {
	subcommandGroup: "view" | "refresh";
	subcommand: "user" | "guild";
	isAdmin?: boolean;
	/** The member running the command; defaults to the administrator. */
	actorId?: string;
	targetUserId?: string;
	/** Leave out the optional `user` option, so the command defaults to the member running it. */
	omitUser?: boolean;
}) {
	const deferReply = vi.fn(async () => undefined);
	const editReply = vi.fn(async (_payload?: unknown) => undefined);
	const followUp = vi.fn(async (_payload?: unknown) => undefined);
	const targetUser = {
		id: input.targetUserId ?? USER_ID,
		displayName: "Target User",
		username: "target-user",
		toString: () => `<@${input.targetUserId ?? USER_ID}>`,
		displayAvatarURL: () => "https://example.test/avatar.png",
	};
	const interaction = {
		guildId: GUILD_ID,
		user: {
			id: input.actorId ?? ADMIN_ID,
			displayName: "Acting User",
			username: "acting-user",
			toString: () => `<@${input.actorId ?? ADMIN_ID}>`,
			displayAvatarURL: () => "https://example.test/actor.png",
		},
		guild: {
			name: "Command Test Server",
			members: {
				fetch: vi.fn(async () => ({ permissions: { has: () => input.isAdmin ?? true } })),
			},
		},
		options: {
			getSubcommandGroup: vi.fn(() => input.subcommandGroup),
			getSubcommand: vi.fn(() => input.subcommand),
			getUser: vi.fn(() => (input.subcommand === "user" && !input.omitUser ? targetUser : null)),
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

	it("view user falls back to an embed-only profile when attachment upload fails", async () => {
		await db.insert(userPersonalityProfiles).values({
			userId: USER_ID,
			guildId: GUILD_ID,
			profile: "Target user writes in dry, concise jokes.",
		});
		const { interaction, editReply, followUp } = createInteraction({ subcommandGroup: "view", subcommand: "user" });
		editReply.mockImplementation(async (payload) => {
			if ((payload as { files?: unknown[] }).files) throw new Error("upload rejected");
		});
		followUp.mockImplementation(async (payload) => {
			if ((payload as { files?: unknown[] }).files) throw new Error("upload rejected");
		});

		await createCommand().chatInputRun(interaction);

		const fallbackPayload = followUp.mock.calls.at(-1)?.[0] as {
			embeds?: Array<{ data?: { description?: string } }>;
			files?: unknown[];
			ephemeral?: boolean;
		};
		expect(fallbackPayload.files).toBeUndefined();
		expect(fallbackPayload.ephemeral).toBe(true);
		expect(fallbackPayload.embeds?.[0]?.data?.description).toContain("Target user writes in dry, concise jokes.");
		expect(fallbackPayload.embeds?.[0]?.data?.description).not.toContain("Failed to upload the profile");
	});

	it("view user reports archive-derived evidence after the cursor", async () => {
		const cursor = new Date("2026-05-29T12:00:00.000Z");
		await db.insert(userPersonalityProfiles).values({
			userId: USER_ID,
			guildId: GUILD_ID,
			profile: "Target user profile.",
			lastTrainingMessageAt: cursor,
			lastTrainingMessageId: "cursor-user",
		});
		await archiveMessages({ count: 2, authorUserId: USER_ID, idPrefix: "user-after" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "view", subcommand: "user" });

		await createCommand().chatInputRun(interaction);

		expect(lastEmbedFieldValue(editReply, "Archived evidence after cursor")).toContain(
			"2 eligible archived message(s)",
		);
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

	it("view guild reports archive-derived evidence after the cursor", async () => {
		const cursor = new Date("2026-05-29T12:00:00.000Z");
		await db.insert(guildPersonalityProfiles).values({
			guildId: GUILD_ID,
			profile: "Server culture profile.",
			lastTrainingMessageAt: cursor,
			lastTrainingMessageId: "cursor-guild",
		});
		await archiveMessages({ count: 3, idPrefix: "guild-after" });
		const { interaction, editReply } = createInteraction({ subcommandGroup: "view", subcommand: "guild" });

		await createCommand().chatInputRun(interaction);

		expect(lastEmbedFieldValue(editReply, "Archived evidence after cursor")).toContain(
			"3 eligible archived message(s)",
		);
	});

	it("refresh user below the archived threshold reports insufficient archived evidence", async () => {
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

		expect(lastEmbedDescription(editReply)).toContain("Personality features are disabled for this server");
		expect(lastEmbedDescription(editReply)).not.toMatch(/opt\s*-?in|consent/i);
	});

	describe("access", () => {
		it("lets a member view their own profile with and without the user option", async () => {
			await db
				.insert(userPersonalityProfiles)
				.values({ userId: USER_ID, guildId: GUILD_ID, profile: "Own profile text." });

			for (const omitUser of [false, true]) {
				const { interaction, deferReply, editReply } = createInteraction({
					subcommandGroup: "view",
					subcommand: "user",
					isAdmin: false,
					actorId: USER_ID,
					omitUser,
				});

				await createCommand().chatInputRun(interaction);

				expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
				expect(lastEmbedDescription(editReply)).toContain("Own profile text.");
			}
		});

		it("refuses a member who asks for someone else's profile, ephemerally and without leaking it", async () => {
			await db
				.insert(userPersonalityProfiles)
				.values({ userId: USER_ID, guildId: GUILD_ID, profile: "Private profile text." });
			const { interaction, deferReply, editReply, followUp } = createInteraction({
				subcommandGroup: "view",
				subcommand: "user",
				isAdmin: false,
				actorId: MEMBER_ID,
			});

			await createCommand().chatInputRun(interaction);

			expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
			expect(lastEmbedTitle(editReply)).toBe("Permission Denied");
			expect(lastEmbedDescription(editReply)).toContain("only view your own");
			expect(JSON.stringify(editReply.mock.calls)).not.toContain("Private profile text.");
			expect((editReply.mock.calls.at(-1)?.[0] as { files?: unknown[] }).files).toBeUndefined();
			expect(followUp).not.toHaveBeenCalled();
		});

		it("lets an administrator view anyone's profile", async () => {
			await db
				.insert(userPersonalityProfiles)
				.values({ userId: USER_ID, guildId: GUILD_ID, profile: "Someone else's profile." });
			const { interaction, editReply } = createInteraction({
				subcommandGroup: "view",
				subcommand: "user",
				isAdmin: true,
				actorId: ADMIN_ID,
			});

			await createCommand().chatInputRun(interaction);

			expect(lastEmbedDescription(editReply)).toContain("Someone else's profile.");
		});

		it("lets any member view the server profile", async () => {
			await db.insert(guildPersonalityProfiles).values({ guildId: GUILD_ID, profile: "Open server culture." });
			const { interaction, deferReply, editReply } = createInteraction({
				subcommandGroup: "view",
				subcommand: "guild",
				isAdmin: false,
				actorId: MEMBER_ID,
			});

			await createCommand().chatInputRun(interaction);

			expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
			expect(lastEmbedDescription(editReply)).toContain("Open server culture.");
		});

		it.each([
			"user",
			"guild",
		] as const)("refuses refresh %s for a member who is not an administrator", async (subcommand) => {
			await archiveMessages({ count: 200, authorUserId: USER_ID, idPrefix: `deny-${subcommand}` });
			const { interaction, deferReply, editReply } = createInteraction({
				subcommandGroup: "refresh",
				subcommand,
				isAdmin: false,
				actorId: USER_ID,
			});

			await createCommand().chatInputRun(interaction);

			expect(deferReply).toHaveBeenCalledWith({ ephemeral: true });
			expect(lastEmbedTitle(editReply)).toBe("Permission Denied");
			expect(mockedBuildPersonalityProfile).not.toHaveBeenCalled();
			expect(mockedBuildGuildPersonalityProfile).not.toHaveBeenCalled();
		});

		it("tells a member with no profile yet that one appears within about 6 hours", async () => {
			const user = createInteraction({ subcommandGroup: "view", subcommand: "user", isAdmin: false, actorId: USER_ID });
			await createCommand().chatInputRun(user.interaction);
			const guild = createInteraction({ subcommandGroup: "view", subcommand: "guild", isAdmin: false });
			await createCommand().chatInputRun(guild.interaction);

			for (const description of [lastEmbedDescription(user.editReply), lastEmbedDescription(guild.editReply)]) {
				expect(description).toContain("within about 6 hours");
				expect(description).not.toMatch(/opt\s*-?in|consent/i);
			}
			expect(lastEmbedDescription(user.editReply)).toContain("100 eligible");
			expect(lastEmbedDescription(guild.editReply)).toContain("200 eligible");
		});
	});
});
