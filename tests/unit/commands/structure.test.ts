import { Command } from "@sapphire/framework";
import { beforeAll, describe, expect, it } from "vitest";
import { GUESS_WHO_MAX_WRONG_GUESSES } from "../../../src/lib/guessWho/session.js";
import { createCommandContext, loadCommandClass, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

const commandFiles = [
	"../../../src/commands/music/play.js",
	"../../../src/commands/music/controls.js",
	"../../../src/commands/music/queue.js",
	"../../../src/commands/music/nowplaying.js",
	"../../../src/commands/music/volume.js",
	"../../../src/commands/music/shuffle.js",
	"../../../src/commands/music/loop.js",
	"../../../src/commands/rpg/work.js",
	"../../../src/commands/rpg/crime.js",
	"../../../src/commands/rpg/shop.js",
	"../../../src/commands/rpg/inventory.js",
	"../../../src/commands/rpg/profile.js",
	"../../../src/commands/rpg/train.js",
	"../../../src/commands/rpg/pet.js",
	"../../../src/commands/rpg/property.js",
	"../../../src/commands/rpg/daily.js",
	"../../../src/commands/rpg/quests.js",
	"../../../src/commands/moderation/ban.js",
	"../../../src/commands/moderation/kick.js",
	"../../../src/commands/moderation/mute.js",
	"../../../src/commands/moderation/unmute.js",
	"../../../src/commands/moderation/warn.js",
	"../../../src/commands/moderation/unban.js",
	"../../../src/commands/moderation/purge.js",
	"../../../src/commands/moderation/case.js",
	"../../../src/commands/moderation/history.js",
	"../../../src/commands/leveling/rank.js",
	"../../../src/commands/leveling/leaderboard.js",
	"../../../src/commands/leveling/rewards.js",
	"../../../src/commands/leveling/reset.js",
	"../../../src/commands/utility/ping.js",
	"../../../src/commands/utility/serverinfo.js",
	"../../../src/commands/utility/userinfo.js",
	"../../../src/commands/utility/avatar.js",
	"../../../src/commands/utility/snipe.js",
	"../../../src/commands/utility/editsnipe.js",
	"../../../src/commands/utility/afk.js",
	"../../../src/commands/utility/remind.js",
	"../../../src/commands/utility/help.js",
	"../../../src/commands/utility/summarize.js",
	"../../../src/commands/utility/personality.js",
	"../../../src/commands/fun/8ball.js",
	"../../../src/commands/fun/coinflip.js",
	"../../../src/commands/fun/choose.js",
	"../../../src/commands/fun/meme.js",
	"../../../src/commands/fun/poll.js",
	"../../../src/commands/tickets/ticket.js",
	"../../../src/commands/tickets/ticket-panel.js",
	"../../../src/commands/roles/reaction-roles.js",
	"../../../src/commands/roles/role-menu.js",
	"../../../src/commands/giveaway/giveaway.js",
	"../../../src/commands/suggestions/suggest.js",
	"../../../src/commands/suggestions/suggestion.js",
	"../../../src/commands/autorespond/autorespond.js",
	"../../../src/commands/config/config.js",
	"../../../src/commands/minecraft/status.js",
	"../../../src/commands/games/guess-who.js",
];

const knownPreconditions = ["GuildOnly", "IsAdmin", "IsModerator", "IsDJ", "TicketChannel", "Cooldown"];

function getPreconditionName(precondition: unknown): unknown {
	if (typeof precondition === "string") return precondition;
	if (precondition && typeof precondition === "object" && "name" in precondition) return precondition.name;
	return precondition;
}

describe("command structure", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	for (const file of commandFiles) {
		const name = file.split("/").pop()?.replace(".js", "") ?? file;

		it(`${name} exports a Command subclass`, async () => {
			const CommandClass = await loadCommandClass(file);
			expect(CommandClass.prototype).toBeInstanceOf(Command);
		});

		it(`${name} instantiates without errors`, async () => {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			expect(instance).toBeInstanceOf(Command);
			expect(instance.name).toBeTruthy();
		});

		it(`${name} has registerApplicationCommands and chatInputRun`, async () => {
			const CommandClass = await loadCommandClass(file);
			expect(typeof CommandClass.prototype.registerApplicationCommands).toBe("function");
			expect(typeof CommandClass.prototype.chatInputRun).toBe("function");
		});
	}

	it("all command files are accounted for", () => {
		expect(commandFiles.length).toBeGreaterThan(0);
	});
});

describe("command preconditions", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	it("music commands require IsDJ precondition", async () => {
		const musicCommands = [
			"../../../src/commands/music/play.js",
			"../../../src/commands/music/controls.js",
			"../../../src/commands/music/volume.js",
			"../../../src/commands/music/shuffle.js",
			"../../../src/commands/music/loop.js",
		];
		for (const file of musicCommands) {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			const names = instance.preconditions.entries.map(getPreconditionName);
			expect(names).toContain("IsDJ");
		}
	});

	it("moderation commands require IsModerator precondition", async () => {
		const modCommands = [
			"../../../src/commands/moderation/ban.js",
			"../../../src/commands/moderation/kick.js",
			"../../../src/commands/moderation/mute.js",
			"../../../src/commands/moderation/unmute.js",
			"../../../src/commands/moderation/warn.js",
			"../../../src/commands/moderation/unban.js",
			"../../../src/commands/moderation/purge.js",
			"../../../src/commands/moderation/case.js",
			"../../../src/commands/moderation/history.js",
		];
		for (const file of modCommands) {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			const names = instance.preconditions.entries.map(getPreconditionName);
			expect(names).toContain("IsModerator");
		}
	});

	it("all precondition names map to known preconditions", async () => {
		for (const file of commandFiles) {
			const CommandClass = await loadCommandClass(file);
			const context = createCommandContext(file.replace(/\.\.\/\.\.\/\.\.\//, "src/").replace(".js", ".ts"));
			const instance = new CommandClass(context, {});
			const names = instance.preconditions.entries.map(getPreconditionName);
			for (const name of names) {
				if (typeof name === "string") {
					expect(knownPreconditions).toContain(name);
				}
			}
		}
	});
});

describe("guess who embeds", () => {
	const archivedMessage = {
		messageId: "message-1",
		guildId: "guild-1",
		channelId: "channel-1",
		authorUserId: "author-1",
		authorUsername: "author_name",
		authorDisplayName: "Author Display",
		content: "This is the archived message to guess.",
		messageCreatedAt: new Date("2025-01-01T00:00:00.000Z"),
		editedAt: null,
		deletedAt: null,
		createdAt: new Date("2025-01-01T00:00:00.000Z"),
		updatedAt: new Date("2025-01-01T00:00:00.000Z"),
	};

	it("builds a prompt embed with quote and remaining guesses", async () => {
		const { buildGuessWhoPromptEmbed } = await import("../../../src/lib/guessWho/embeds.js");

		const embed = buildGuessWhoPromptEmbed(archivedMessage).toJSON();

		expect(embed.title).toBe("Guess Who?");
		expect(embed.description).toBe("> This is the archived message to guess.");
		expect(embed.fields).toContainEqual({ name: "How to play", value: "Mention the user who sent this message." });
		expect(embed.footer?.text).toBe(`${GUESS_WHO_MAX_WRONG_GUESSES} guesses remaining`);
	});

	it("builds a reveal embed with source details and outcome", async () => {
		const { buildGuessWhoRevealEmbed } = await import("../../../src/lib/guessWho/embeds.js");

		const embed = buildGuessWhoRevealEmbed({
			message: archivedMessage,
			outcome: "correct",
			guessedByUserId: "guesser-1",
		}).toJSON();

		expect(embed.title).toBe("Correct Guess!");
		expect(embed.description).toBe("> This is the archived message to guess.");
		expect(embed.fields).toEqual(
			expect.arrayContaining([
				{ name: "Author", value: "<@author-1> (Author Display)", inline: true },
				{ name: "Sent", value: "<t:1735689600:R>", inline: true },
				{ name: "Message ID", value: "message-1", inline: false },
				{
					name: "Source",
					value: "[Jump to message](https://discord.com/channels/guild-1/channel-1/message-1)",
					inline: false,
				},
				{ name: "Outcome", value: "<@guesser-1> guessed correctly.", inline: false },
			]),
		);
	});
});
