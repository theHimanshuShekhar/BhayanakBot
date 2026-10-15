import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createCommandContext, loadCommandClass, setupSapphireContainer } from "../../helpers/sapphireMocks.js";

async function load(dir: string, file: string) {
	const CommandClass = await loadCommandClass(`../../../src/commands/${dir}/${file}.js`);
	return new CommandClass(createCommandContext(`src/commands/${dir}/${file}.ts`), {});
}

function moderatorPermission(instance: Awaited<ReturnType<typeof load>>): bigint | undefined {
	const entry = instance.options.preconditions?.find(
		(p): p is { name: string; context: { permission: bigint } } => typeof p === "object" && "name" in p,
	);
	return entry?.name === "IsModerator" ? entry.context.permission : undefined;
}

async function defaultMemberPermissions(instance: Awaited<ReturnType<typeof load>>) {
	let json: ReturnType<SlashCommandBuilder["toJSON"]> | undefined;
	instance.registerApplicationCommands({
		registerChatInputCommand(register: (b: SlashCommandBuilder) => SlashCommandBuilder) {
			json = register(new SlashCommandBuilder()).toJSON();
		},
	} as never);
	return json?.default_member_permissions;
}

describe("moderator authority matches the action", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	const authority: [string, string, bigint][] = [
		["moderation", "ban", PermissionFlagsBits.BanMembers],
		["moderation", "unban", PermissionFlagsBits.BanMembers],
		["moderation", "kick", PermissionFlagsBits.KickMembers],
		["moderation", "mute", PermissionFlagsBits.ModerateMembers],
		["moderation", "unmute", PermissionFlagsBits.ModerateMembers],
		["moderation", "warn", PermissionFlagsBits.ManageMessages],
		["moderation", "purge", PermissionFlagsBits.ManageMessages],
		["moderation", "case", PermissionFlagsBits.ManageMessages],
		["moderation", "history", PermissionFlagsBits.ManageMessages],
		["giveaway", "giveaway", PermissionFlagsBits.ManageMessages],
	];

	it.each(authority)("%s/%s accepts the %s permission", async (dir, file, permission) => {
		expect(moderatorPermission(await load(dir, file))).toBe(permission);
	});
});

describe("staff commands are hidden from regular members", () => {
	beforeAll(() => {
		setupSapphireContainer();
	});

	const hidden: [string, string, bigint][] = [
		["moderation", "ban", PermissionFlagsBits.BanMembers],
		["moderation", "unban", PermissionFlagsBits.BanMembers],
		["moderation", "kick", PermissionFlagsBits.KickMembers],
		["moderation", "mute", PermissionFlagsBits.ModerateMembers],
		["moderation", "unmute", PermissionFlagsBits.ModerateMembers],
		["moderation", "warn", PermissionFlagsBits.ModerateMembers],
		["moderation", "case", PermissionFlagsBits.ModerateMembers],
		["moderation", "history", PermissionFlagsBits.ModerateMembers],
		["moderation", "purge", PermissionFlagsBits.ManageMessages],
		["config", "config", PermissionFlagsBits.ManageGuild],
		["autorespond", "autorespond", PermissionFlagsBits.ManageGuild],
		["giveaway", "giveaway", PermissionFlagsBits.ManageGuild],
		["leveling", "reset", PermissionFlagsBits.ManageGuild],
	];

	it.each(hidden)("%s/%s requires %s to be listed", async (dir, file, permission) => {
		expect(await defaultMemberPermissions(await load(dir, file))).toBe(permission.toString());
	});

	it.each(["snipe", "editsnipe"])("/%s stays open to everyone", async (file) => {
		const instance = await load("utility", file);
		expect(await defaultMemberPermissions(instance)).toBeUndefined();
		expect(instance.options.preconditions).toEqual(["GuildOnly"]);
	});
});
