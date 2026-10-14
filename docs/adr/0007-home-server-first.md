# Home server first, generic features isolated per guild

The bot is publicly invitable (the website advertises an invite link, and it sits in 11 guilds), but much of it was built for one server: Guess Who, personality profiles, Zen-backed AI replies and summaries, the game-server trackers, and the dashboard presence snapshot. We split features into two kinds. Home-Server Features run only in the guild named by `TARGET_GUILD_ID`; their slash commands are registered as guild commands there and are invisible elsewhere, and their passive triggers (mentions, random replies) do nothing in other guilds. Generic Features (moderation, music, leveling, giveaways, polls, reminders, autoresponses) work everywhere and must be fully tenant-isolated: every query that looks something up by message or channel id is also scoped to the invoking guild, and an id from another guild is indistinguishable from one that does not exist.

## Considered Options

Making the bot private to the home server would have shrunk the attack surface but removed the point of the public site. Making every feature configurable per guild, including AI and Guess Who, would have required per-guild consent for sending content to Zen and per-guild channel configuration for features nobody else asked for.

## Consequences

Anything that sends Discord message content to an external model is a Home-Server Feature by definition, so content from guilds that merely invited the bot never leaves Discord. Because any guild admin can configure Generic Features, admin-supplied input (autoresponse regexes, role-menu roles, durations) is treated as untrusted with respect to the rest of the bot: regexes run on a linear-time engine and durations are bounded.
