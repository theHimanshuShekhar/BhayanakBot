import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from "discord.js";
import type { APIEmbedField } from "discord.js";
import type { CollectedCommand, HelpSnapshot } from "./collect.js";

export const PAGE_SIZE = 8;
const EMBED_COLOR = 0x5865f2;

export interface RenderedPage {
	embed: EmbedBuilder;
	components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
}

function buildBackRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("help:home").setLabel("⬅ Overview").setStyle(ButtonStyle.Secondary),
	);
}

export function buildOverview(snapshot: HelpSnapshot, note?: string): RenderedPage {
	const embed = new EmbedBuilder()
		.setTitle("📖 Bot Commands")
		.setColor(EMBED_COLOR)
		.setDescription(
			`${note ? `${note}\n\n` : ""}Pick a category below to see its commands. Use \`/help category:<name>\` to jump directly.`,
		);

	const fields: APIEmbedField[] = snapshot.categories.map((cat) => {
		const count = snapshot.commandsByCategory.get(cat.id)?.length ?? 0;
		return {
			name: `${cat.emoji} ${cat.label}`,
			value: `${cat.description}\n*${count} command${count === 1 ? "" : "s"}*`,
		};
	});
	embed.addFields(fields);

	const select = new StringSelectMenuBuilder()
		.setCustomId("help:select:cat")
		.setPlaceholder("Jump to a category…")
		.addOptions(
			snapshot.categories.map((cat) =>
				new StringSelectMenuOptionBuilder()
					.setLabel(cat.label)
					.setEmoji(cat.emoji)
					.setDescription(truncate(cat.description, 100))
					.setValue(cat.id),
			),
		);

	return {
		embed,
		components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
	};
}

export function buildCategoryPage(snapshot: HelpSnapshot, categoryId: string, page: number): RenderedPage | null {
	const category = snapshot.categories.find((c) => c.id === categoryId);
	if (!category) return null;
	const commands = snapshot.commandsByCategory.get(categoryId) ?? [];
	const totalPages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE));
	const safePage = Math.max(0, Math.min(page, totalPages - 1));
	const slice = commands.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

	const embed = new EmbedBuilder()
		.setTitle(`${category.emoji} ${category.label}`)
		.setColor(EMBED_COLOR)
		.setDescription(category.description);

	for (const cmd of slice) {
		const name = `${cmd.markers.length > 0 ? `${cmd.markers.join(" ")} ` : ""}/${cmd.name}`;
		embed.addFields({ name, value: cmd.help.summary });
	}

	if (totalPages > 1) {
		embed.setFooter({ text: `Page ${safePage + 1}/${totalPages} · ${commands.length} commands` });
	} else {
		embed.setFooter({ text: `${commands.length} command${commands.length === 1 ? "" : "s"}` });
	}

	const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
	if (slice.length > 0) {
		const select = new StringSelectMenuBuilder()
			.setCustomId(`help:select:cmd:${categoryId}:${safePage}`)
			.setPlaceholder("View details for a command…")
			.addOptions(
				slice.map((cmd) =>
					new StringSelectMenuOptionBuilder()
						.setLabel(`/${cmd.name}`)
						.setDescription(truncate(cmd.help.summary, 100))
						.setValue(cmd.name),
				),
			);
		components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
	}

	const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId("help:home").setLabel("⬅ Overview").setStyle(ButtonStyle.Secondary),
	);
	if (totalPages > 1) {
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`help:cat:${categoryId}:${safePage - 1}`)
				.setLabel("◀ Prev")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(safePage === 0),
			new ButtonBuilder()
				.setCustomId(`help:cat:${categoryId}:${safePage + 1}`)
				.setLabel("Next ▶")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(safePage >= totalPages - 1),
		);
	}
	components.push(navRow);

	return { embed, components };
}

export function buildCommandDetail(
	snapshot: HelpSnapshot,
	commandName: string,
	backCategoryId: string | null,
	backPage: number,
): RenderedPage | null {
	const entry = snapshot.commandByName.get(commandName);
	if (!entry) return null;
	const category = snapshot.categories.find((c) => c.id === entry.categoryId);

	const titleMarkers = entry.markers.length > 0 ? ` ${entry.markers.join(" ")}` : "";
	const descriptionParts = [entry.help.summary];
	if (entry.help.usageNotes) descriptionParts.push(entry.help.usageNotes);

	const embed = new EmbedBuilder()
		.setTitle(`/${entry.name}${titleMarkers}`)
		.setColor(EMBED_COLOR)
		.setDescription(descriptionParts.join("\n\n"));

	if (entry.help.examples.length > 0) {
		embed.addFields({
			name: "Examples",
			value: truncate(codeBlock(entry.help.examples.join("\n")), 1024),
		});
	} else if (entry.isFallback) {
		embed.addFields({ name: "Examples", value: "*No examples yet.*" });
	}

	if (entry.help.subcommands) {
		for (const [subName, sub] of Object.entries(entry.help.subcommands)) {
			const value =
				sub.examples.length > 0
					? truncate(`${sub.summary}\n${codeBlock(sub.examples.join("\n"))}`, 1024)
					: sub.summary;
			embed.addFields({ name: `/${entry.name} ${subName}`, value });
		}
	}

	if (category) {
		embed.setFooter({ text: `${category.emoji} ${category.label}` });
	}

	const navRow = new ActionRowBuilder<ButtonBuilder>();
	const targetCategoryId = backCategoryId ?? entry.categoryId;
	const targetCategory = snapshot.categories.find((c) => c.id === targetCategoryId);
	if (targetCategory) {
		navRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`help:cat:${targetCategoryId}:${backPage}`)
				.setLabel(`⬅ Back to ${targetCategory.label}`)
				.setStyle(ButtonStyle.Secondary),
		);
	}
	navRow.addComponents(
		new ButtonBuilder().setCustomId("help:home").setLabel("⬅ Overview").setStyle(ButtonStyle.Secondary),
	);

	return { embed, components: [navRow] };
}

export function buildOverviewWithNote(snapshot: HelpSnapshot, note: string): RenderedPage {
	return buildOverview(snapshot, note);
}

export function buildNotFoundFallback(snapshot: HelpSnapshot, label: string): RenderedPage {
	return buildOverview(snapshot, `Couldn't find ${label} — here's the full list.`);
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function codeBlock(text: string): string {
	// Guard against the rare case where an example contains triple backticks.
	const safe = text.replace(/```/g, "``​`");
	return `\`\`\`\n${safe}\n\`\`\``;
}

// Export the unused `buildBackRow` so future callers can reuse; currently used indirectly.
export { buildBackRow };
