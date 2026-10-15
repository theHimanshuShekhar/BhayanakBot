import { type Guild, type GuildMember, PermissionFlagsBits } from "discord.js";

/**
 * Shared same-channel rule for playback controls (commands and buttons): while the bot is connected to a voice
 * channel, the member must be in that channel. Administrators are exempt so they can stop abuse remotely.
 * Returns the refusal message, or null when the member may proceed.
 */
export function getVoiceChannelRefusal(guild: Guild, member: GuildMember): string | null {
	const botChannelId = guild.members.me?.voice.channelId;
	if (!botChannelId) return null;
	if (member.permissions.has(PermissionFlagsBits.Administrator)) return null;
	if (member.voice.channelId === botChannelId) return null;
	return `I'm playing in <#${botChannelId}>. Join that voice channel to use this.`;
}

const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/;

/** The video ID of a YouTube single-video URL (`watch?v=` or `youtu.be/`), ignoring any `list=` parameter. */
export function getYouTubeVideoId(query: string): string | null {
	let url: URL;
	try {
		url = new URL(query.trim());
	} catch {
		return null;
	}
	const host = url.hostname.replace(/^(www|m|music)\./, "");
	let id: string | null = null;
	if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
	else if (host === "youtube.com" && url.pathname === "/watch") id = url.searchParams.get("v");
	return id && YOUTUBE_VIDEO_ID.test(id) ? id : null;
}
