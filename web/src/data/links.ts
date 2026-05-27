const DEFAULT_BOT_INVITE_URL = "https://discord.com/oauth2/authorize";

export function getBotInviteUrl(): string {
	return import.meta.env.PUBLIC_BOT_INVITE_URL || DEFAULT_BOT_INVITE_URL;
}
