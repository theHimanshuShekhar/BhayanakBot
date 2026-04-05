import { Subcommand } from "@sapphire/plugin-subcommands";
import { EmbedBuilder } from "discord.js";
import ms from "ms";
import { db } from "../../lib/database.js";
import { reminders } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { markReminderSent } from "../../db/queries/reminders.js";

export class RemindCommand extends Subcommand {
	public constructor(context: Subcommand.LoaderContext, options: Subcommand.Options) {
		super(context, {
			...options,
			subcommands: [
				{ name: "set", chatInputRun: "runSet" },
				{ name: "list", chatInputRun: "runList" },
				{ name: "cancel", chatInputRun: "runCancel" },
			],
			preconditions: ["GuildOnly"],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("remind")
				.setDescription("Manage reminders")
				.addSubcommand((sub) =>
					sub
						.setName("set")
						.setDescription("Set a reminder")
						.addStringOption((opt) =>
							opt.setName("time").setDescription("When to remind you (e.g. 10m, 2h, 1d)").setRequired(true),
						)
						.addStringOption((opt) =>
							opt.setName("message").setDescription("What to remind you about").setRequired(true),
						),
				)
				.addSubcommand((sub) => sub.setName("list").setDescription("List your active reminders"))
				.addSubcommand((sub) =>
					sub
						.setName("cancel")
						.setDescription("Cancel a reminder by ID")
						.addIntegerOption((opt) => opt.setName("id").setDescription("Reminder ID").setRequired(true)),
				),
		);
	}

	public async runSet(interaction: Subcommand.ChatInputCommandInteraction) {
		const timeStr = interaction.options.getString("time", true);
		const message = interaction.options.getString("message", true);

		const duration = ms(timeStr as any) as unknown as number;
		if (!duration || duration <= 0) {
			return interaction.reply({ content: "Invalid time format. Use e.g. `10m`, `2h`, `1d`.", ephemeral: true });
		}

		const remindAt = new Date(Date.now() + duration);
		const [reminder] = await db
			.insert(reminders)
			.values({
				userId: interaction.user.id,
				channelId: interaction.channelId,
				guildId: interaction.guildId!,
				message,
				remindAt,
			})
			.returning();

		return interaction.reply({
			content: `Reminder set! I'll remind you <t:${Math.floor(remindAt.getTime() / 1000)}:R> (ID: \`${reminder.id}\`)`,
			ephemeral: true,
		});
	}

	public async runList(interaction: Subcommand.ChatInputCommandInteraction) {
		const userReminders = await db.query.reminders.findMany({
			where: and(eq(reminders.userId, interaction.user.id), eq(reminders.sent, false)),
		});

		if (userReminders.length === 0) {
			return interaction.reply({ content: "You have no active reminders.", ephemeral: true });
		}

		const lines = userReminders.map(
			(r) => `\`${r.id}\` — <t:${Math.floor(r.remindAt.getTime() / 1000)}:R> — ${r.message.slice(0, 80)}`,
		);

		const embed = new EmbedBuilder()
			.setTitle("Your Reminders")
			.setDescription(lines.join("\n"))
			.setColor(0x5865f2);

		return interaction.reply({ embeds: [embed], ephemeral: true });
	}

	public async runCancel(interaction: Subcommand.ChatInputCommandInteraction) {
		const id = interaction.options.getInteger("id", true);

		const reminder = await db.query.reminders.findFirst({
			where: and(eq(reminders.id, id), eq(reminders.userId, interaction.user.id)),
		});

		if (!reminder) {
			return interaction.reply({ content: "Reminder not found or not yours.", ephemeral: true });
		}

		await markReminderSent(id);
		return interaction.reply({ content: `Cancelled reminder \`${id}\`.`, ephemeral: true });
	}
}
