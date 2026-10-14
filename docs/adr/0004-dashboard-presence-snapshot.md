# Serve a dashboard presence snapshot from the bot

The homelab dashboard shows a Discord widget: who is online and who shares each voice channel. It reads Discord's public widget endpoint, whose member shape is anonymized — no bot flag, no durable ids — so bots could only be filtered by a hand-maintained name regex in the dashboard config. Every new bot rejoins the widget until someone edits the pattern. We resolved it by having the bot publish a dashboard presence snapshot: guild members merged with widget presence, served as JSON from the web service on an interval, consumed by the dashboard's custom widget. The name regex is deleted once the widget reads the snapshot's authoritative bot flags.

## Considered Options

A live HTTP endpoint inside the bot process serving the gateway cache directly was the freshest option, but it opens a second port and auth surface on a process whose job is interactions and music, and it couples bot deploys to dashboard needs. A Glance-side sidecar holding its own copy of the bot token was rejected outright — the token lives in exactly one place, and a sidecar would only get REST data without the gateway cache the bot already holds. For presence itself, enabling the privileged presences intent would make the snapshot the single source of truth, but it costs a portal errand for a value the widget endpoint already provides, so the widget endpoint stays as the presence source.

Serving the endpoint openly on LAN mirrors how the web service already runs; a shared-secret header was considered and set aside because the dashboard and the web service share the same LAN-only trust boundary and the data is guild presence, not credentials.

## Consequences

The snapshot is interval-published, so voice joins lag the interval plus the dashboard's cache (low single-digit minutes, still several times fresher than the previous five-minute widget cache). Event-driven invalidation on voice state changes is the explicit fallback if stale occupancy annoys in practice.

Display policy is fixed: bot accounts are hidden from the member list and empty channels, but a bot audibly occupying a voice channel (for example the music bot) is shown as an occupant — presence in voice is information, not noise. The dashboard widget renders occupancy from voice states only and must never infer channel membership from presence.

## Amendment (2026-10-15): bearer token now that the site is public

The "LAN-only trust boundary" premise no longer holds: the same web service now serves the public marketing site, so `/api/dashboard-presence` (member user ids, per-member voice channel, mute, deaf, and streaming state) was readable from the internet. The endpoint now requires `Authorization: Bearer <DASHBOARD_API_TOKEN>` and answers 404 without it; the homelab widget sends the header. The token is optional configuration so local development without it keeps working, but any deployment reachable from outside the LAN must set it. A separate LAN-only listener was the stronger boundary but was rejected as another moving part for one endpoint.
