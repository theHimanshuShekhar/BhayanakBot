import { Command } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel } from "discord.js";
import { db } from "../../lib/database.js";
import { polls } from "../../db/schema.js";

export class PollCommand extends Command {
	public constructor(context: Command.LoaderContext, options: Command.Options) {
		super(context, {
			...options,
			preconditions: ["GuildOnly"],
			help: {
				summary: "Create a button-based poll with up to 4 options.",
				examples: ['/poll question:"Best language?" options:"Python,JS,Go,Rust"'],
			},
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName("poll")
				.setDescription("Create a poll with up to 4 options")
				.addStringOption((opt) =>
					opt.setName("question").setDescription("Poll question").setRequired(true),
				)
				.addStringOption((opt) => opt.setName("option1").setDescription("Option 1").setRequired(true))
				.addStringOption((opt) => opt.setName("option2").setDescription("Option 2").setRequired(true))
				.addStringOption((opt) => opt.setName("option3").setDescription("Option 3").setRequired(false))
				.addStringOption((opt) => opt.setName("option4").setDescription("Option 4").setRequired(false))
				.addIntegerOption((opt) =>
					opt
						.setName("duration")
						.setDescription("Poll duration in minutes (0 = no expiry)")
						.setMinValue(0)
						.setRequired(false),
				),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		const question = interaction.options.getString("question", true);
		const rawOptions = [
			interaction.options.getString("option1", true),
			interaction.options.getString("option2", true),
			interaction.options.getString("option3"),
			interaction.options.getString("option4"),
		].filter(Boolean) as string[];

		const durationMins = interaction.options.getInteger("duration") ?? 0;
		const expiresAt = durationMins > 0 ? new Date(Date.now() + durationMins * 60_000) : null;

		const optionData = rawOptions.map((label) => ({ label, votes: [] as string[] }));

		const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
		const embed = new EmbedBuilder()
			.setTitle("📊 " + question)
			.setDescription(optionData.map((o, i) => `${emojis[i]} ${o.label} — **0 votes**`).join("\n"))
			.setColor(0x5865f2)
			.setFooter({ text: expiresAt ? `Ends at ${expiresAt.toUTCString()}` : "No expiry" });

		const buttons = optionData.map((o, i) =>
			new ButtonBuilder()
				.setCustomId(`poll_vote:${i}`)
				.setLabel(o.label.slice(0, 80))
				.setEmoji(emojis[i])
				.setStyle(ButtonStyle.Primary),
		);

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

		await interaction.deferReply();
		const msg = await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });

		await db.insert(polls).values({
			messageId: msg.id,
			channelId: interaction.channelId,
			guildId: interaction.guildId!,
			question,
			options: optionData,
			expiresAt,
		});

		return interaction.deleteReply();
	}
}
