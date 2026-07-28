# Delete the tracker category when the Palworld server is unreachable

The Palworld tracker renders the live player roster as Discord channels inside a category, where an empty category legitimately means "the server is up and nobody is online". That leaves no way to also express "the bot cannot see the server" — both states look like a category with no player channels. We resolved it by making the category's *existence* the reachability signal: after two consecutive failed sweeps the bot deletes the entire category, and the next successful sweep recreates it.

## Considered Options

Keeping the category and renaming it to something like "Bhayanak Palworld — offline" was the obvious alternative. It preserves the category's position in the sidebar and avoids churn, but channel name changes are rate-limited to 2 per 10 minutes and the category already spends that budget on its online count, so the offline marker could not be relied on to appear promptly. Leaving stale player channels in place was rejected outright — a roster that keeps showing players who may have logged out hours ago is worse than no roster.

## Consequences

The category is disposable, so nothing durable may live in it: no pinned messages, no member-written content, no manually added channels. Anything a human puts there is destroyed the next time the Palworld API has a bad two minutes. This is why player channels are read-only, and why the category is looked up by name and created on demand rather than tracked by a stored ID.

A single failed sweep deliberately does not trigger deletion. Palworld servers stall while saving the world, and one stall must not tear down the roster.
