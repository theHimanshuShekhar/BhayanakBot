# Delete the tracker category when the Palworld server is unreachable

The Palworld tracker renders the live player roster as Discord channels inside a category, where an empty category legitimately means "the server is up and nobody is online". That leaves no way to also express "the bot cannot see the server" — both states look like a category with no player channels. We resolved it by making the category's *existence* the reachability signal: after two consecutive failed sweeps the bot deletes the entire category, and the next successful sweep recreates it.

## Considered Options

Keeping the category and renaming it to something like "Bhayanak Palworld — offline" was the obvious alternative. It preserves the category's position in the sidebar and avoids churn, but channel name changes are rate-limited to 2 per 10 minutes and the category already spends that budget on its online count, so the offline marker could not be relied on to appear promptly. Leaving stale player channels in place was rejected outright — a roster that keeps showing players who may have logged out hours ago is worse than no roster.

## Consequences

The category is disposable, so nothing durable may live in it: no pinned messages, no member-written content, no manually added channels. Anything a human puts there is destroyed the next time the Palworld API has a bad two minutes. This is why player channels are read-only, and why the category is looked up by name and created on demand rather than tracked by a stored ID.

A single failed sweep deliberately does not trigger deletion. Palworld servers stall while saving the world, and one stall must not tear down the roster.

## Amendment (2026-10-15): an empty roster also hides the category

Since commit a7f5e8b, both the Palworld and Minecraft trackers hide the category when a sweep sees nobody online, not only when the server is unreachable. "Nobody playing" and "server down" are equally uninteresting to members, and an empty category in the sidebar is clutter, so we accepted losing the distinction this ADR was written to preserve. The category's existence now means "someone is playing". The two-sweep debounce still applies to both cases, and the category is matched by its exact tracker name pattern rather than a "Palworld" prefix, so a human-made category that happens to start with that word is never adopted or emptied.
