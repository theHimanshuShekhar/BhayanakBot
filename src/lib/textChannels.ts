import { type Channel, ChannelType, type NewsChannel, type TextChannel } from "discord.js";

/**
 * Channel types the bot can post plain messages to on its own: log, welcome, goodbye, level-up, starboard, music,
 * and random-response channels. Threads (they archive) and voice/stage channels are deliberately excluded.
 */
export const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

export function isTextChannelType(type: ChannelType): boolean {
	return (TEXT_CHANNEL_TYPES as readonly ChannelType[]).includes(type);
}

/** True for a guild channel the bot can post to; false for a missing channel, category, thread, voice, or stage. */
export function isPostableTextChannel(channel: Channel | null | undefined): channel is TextChannel | NewsChannel {
	return channel != null && isTextChannelType(channel.type);
}
