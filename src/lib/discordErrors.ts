import { DiscordAPIError, type RESTJSONErrorCodes } from "discord.js";

export function isDiscordApiError(error: unknown, code: RESTJSONErrorCodes): boolean {
	return error instanceof DiscordAPIError && error.code === code;
}
