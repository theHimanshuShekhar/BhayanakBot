# Dependency advisories

`pnpm audit:prod` (`pnpm audit --prod --audit-level=high`) is the CI gate: it fails on any high or critical advisory in production dependencies. Renovate (`renovate.json`) opens a weekly grouped PR for minor and patch updates and one PR per major update.

Advisories below the gate are listed here when they cannot be fixed by upgrading. Re-check them whenever the parent package updates.

## Accepted

| Package | Severity | Path | Why it is accepted |
|---|---|---|---|
| `file-type` 16.x | moderate (GHSA-5v7r-6r5c-r473) | `@discord-player/extractor` > `file-type` | The patched range is `>=21.3.1`, a different major (ESM-only, changed API) that `@discord-player/extractor@7.2.0` (latest) does not support (it depends on `^16.5.4`), so an override would break the extractor. The flaw is a denial-of-service loop when sniffing a malformed ASF (WMV/WMA) file, reachable only by queueing a crafted attachment URL. Revisit when `@discord-player/extractor` bumps it. |
| `esbuild` 0.27.x | low (GHSA-g7r4-m6w7-qqqr) | `astro` > `vite` > `esbuild` | Arbitrary file read affects the esbuild dev server on Windows only. The bot and web run on Linux in production and only use esbuild at build time. Revisit when Astro's Vite bumps esbuild to `>=0.28.1`. |

## Overrides

`pnpm-workspace.yaml` `overrides` raises transitive packages whose parents have not shipped a patched range. All are same-major bumps except `tar`:

- `tar` 6 to 7: only `@discordjs/node-pre-gyp` (the `@discordjs/opus` prebuilt-binary installer) uses it, through `tar.extract` and `tar.create`, which tar 7 keeps.
- `brace-expansion` 1.x, `source-map-js` 1.x, `ws` 8.x: patch/minor bumps.

Remove an override once the parent depends on a patched version.
