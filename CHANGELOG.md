# Change Log

## 2.11.0 - 2026-11-22
- Users can run one access-controlled command per minute; the old 10-per-minute bucket is gone. The owner is exempt.
- `/background check`, `/groups`, `/records`, and `/badge count` each have their own 5-per-UTC-day budget. The existing 50-per-day overall cap still applies, and the owner is exempt from both.

## 2.10.1 - 2026-11-22
- `/admin` is now owner-only: anyone else gets Access Denied instead of the admin panel. The panel's menu, modal, and color handlers already checked the owner, but the command that opened the panel did not.

## 2.10.0 - 2026-11-22
- Removed `/grade`: the evaluation and Host Rating menus, grade reports, the Google Sheets rubric engine, and the grading feedback channel are gone.
- Restored Discord's native "bot is thinking" state: waiting commands defer their reply instead of editing a custom spinner, and `/test` is removed with it.
- `/api`, `/info`, and `/data` no longer report Ollama or a grading model; Alt Risk still uses the local model when it is available and falls back to the rule-based score otherwise.

## 2.9.2 - 2026-11-22
- The start script now uses `--env-file-if-exists`, so the bot can run on a host that injects environment variables and has no `.env` file, while a local checkout still reads its `.env`.
- `esbuild`, `esbuild-plugin-pino`, and `pino-pretty` are now runtime dependencies, so hosts that install production dependencies only can still bundle `dist/` before starting.
- `PORT` falls back to 3000 when the host does not provide one, instead of refusing to start.

## 2.9.1 - 2026-11-19
- `/background check` no longer drops the badge chart silently: when badge history cannot be loaded or drawn, the embed now states the reason.
- A rejected Roblox Open Cloud key now reports that the key may be inactive, expired, or missing this machine's IP address from its allowed IPs, instead of only telling the owner to replace the secret.
- `/changelog` keeps every release now that the change log exceeds Discord's 25-field embed limit: the oldest releases are packed together instead of failing to build the embed.

## 2.9.0 - 2026-11-15
- Replaced Discord's native dotted "bot is thinking" state with the spinner in every waiting command: `/background`, `/badge count`, `/groups`, `/records`, `/profile`, `/search`, `/api`, the grade feedback modal, and the grade report modal.
- Replies now start immediately with a spinner frame and animate the same message by editing it, so results replace the spinner in place.
- Sped the animation up from 800 ms to a 600 ms frame interval.
- `/test` now uses the same spinner path as the real commands and reports the frames it actually drew.
- Finishing a request always stops the animation first, so a late frame can never overwrite the final embed; an animation that is never stopped releases itself after five minutes.

## 2.8.0 - 2026-11-15
- Added a reusable waiting spinner, `animateSpinner`, which cycles `/ – \ |` by editing one message instead of sending new ones.
- Added `/test`, which plays the spinner for about six seconds and then reports how many frames it drew, so the animation can be checked in Discord.
- `/test` requires granted access like the other commands.

## 2.7.0 - 2026-11-15
- Added `/profile`, which resolves a Roblox username and returns only that user's profile link.
- `/profile` requires granted access like the other lookups, uses the same 10-per-minute rate limit, and has its own embed color under `/data` colors.
- Removed the Windows launcher `Start SergeantGuruV2.bat`; `Start SergeantGuruV2.sh` is now the only launcher and the README is Linux-only.

## 2.6.0 - 2026-11-15
- The local grading model default is now `qwen2.5:1.5b`, replacing `qwen2.5:0.5b` in `.env`, the code default, and both launchers.
- Grading and Alt Risk AI calls now send a JSON schema instead of loose JSON mode, so a small model cannot drift from the expected `reviews`, `suggestions`, or `chance` shape.
- Added a Linux launcher, `Start SergeantGuruV2.sh` (marked executable in Git), that mirrors the Windows `.bat`: it checks Node.js and pnpm, starts Ollama when it is installed but stopped, warms the model, and runs `pnpm start`.
- Set `nodeLinker: hoisted` in `pnpm-workspace.yaml` so the workspace installs on filesystems that cannot store symlinks, such as exFAT or NTFS USB drives.
- Disabled pnpm's pre-run install check on such drives, so starting the bot no longer prints a `.bin` symlink error before every launch.
- The Linux launcher no longer reports missing dependencies when pnpm has installed them into the workspace root.
- Bot startup now waits for discord.js's `clientReady` event, removing the deprecation warning on every launch.
- The README now documents Linux setup and warns that thinking models such as `qwen3:4b` use the whole response budget on reasoning and return no usable JSON.

## 2.5.0 - 2026-11-14
- Removed the Bloxlink integration, including `/roblox`, the `/background check` Discord Query option, and the `BLOXLINK_*` environment variables.
- `/background check`, `/records`, and the other lookups now accept Roblox usernames only.
- `/search` no longer resolves linked accounts; it searches the interaction log directly.

## 2.4.3 - 2026-11-14
- Bloxlink lookups now fall back to the global API when `BLOXLINK_GLOBAL_API_KEY` is set, so linked users outside your server still resolve.
- Guild lookups are tried first; the global lookup only runs when the guild lookup reports no linked account.

## 2.4.2 - 2026-11-13
- Added a **Discord Query** option to `/background check`, which resolves a linked Discord user ID through Bloxlink and adds the linked account to the report.
- `/background check` now accepts either a Roblox username or a Discord Query and explains when both or neither are provided.

## 2.4.1 - 2026-11-13
- Bloxlink lookups now use the guild-scoped API endpoints and the configurable `BLOXLINK_GUILD_ID` value.
- Bloxlink errors now explain guild mismatches, missing Bloxlink setup, and unlinked users instead of returning raw API text.

## 2.4.0 - 2026-11-13
- Added optional Bloxlink integration using `BLOXLINK_API_KEY` to translate between Discord user IDs and Roblox accounts.
- Added `/roblox` to look up the Roblox account linked to a Discord user ID, or the Discord accounts linked to a Roblox username.
- `/search` now includes logs from linked accounts when a Discord ID or Roblox username is resolved through Bloxlink.
- `/background check` and `/records` now accept a linked Discord user ID in place of a Roblox username.

## 2.3.7 - 2026-11-13
- Fixed `/search` failing with `Invalid number value` when a query matched more than 25 log entries.
- Search results are now split into safe pages before rendering, so any number of matches can be shown without exceeding Discord's embed limits.

## 2.3.6 - 2026-11-13
- `/search` now scans the full interaction-log history and returns every matching entry instead of only the latest five.
- Search results show how many log messages were scanned and warn when the 100,000-message safety cap is reached.

## 2.3.5 - 2026-11-13
- Paginated embeds now target 15 lines per page instead of 5, keeping related sections together with fewer page turns.

## 2.3.4 - 2026-11-13
- `/changelog` now paginates one release per section, so long change logs are split across pages instead of being truncated.
- `/badge count` now uses the universal footer, so every embed ends with `SergeantGuruV2 | HH:MMZ | ID: ...`.
- Error messages for background checks, badge counts, groups, and records now use clear fallback text and more specific error titles.

## 2.3.3 - 2026-11-13
- `/background check`, `/badge count`, and `/groups` now return one complete embed without pagination.
- Added `/records` for a focused lookup of blacklist and Secret Service Trello entries plus [x]Tracker marks.
- `/records` has its own configurable embed color.

## 2.3.2 - 2026-11-13
- Logs are never paginated: every interaction and grading-feedback log is sent as one complete embed.
- Badge-chart counts always use ASCII thousands separators, so totals like `1,252` no longer render as `1?252`.
- Every slash command and subcommand has a short description, and admin, data, and grade menu options explain their action.

## 2.3.1 - 2026-11-13
- Pagination now uses dynamic page sizes: the description and each field stay whole, so related information shares a page and a page can exceed five lines when a block needs it.

## 2.3.0 - 2026-11-13
- Embeds with more than five lines of information are paginated with Previous and Next buttons across `/info`, `/data`, `/api`, `/groups`, `/changelog`, `/search`, and the background-check/badge reports.
- Interaction logs link the server and channel (or DM) next to their IDs, and keep the raw username in its own field so `/search` still matches it.
- Every embed now uses the universal footer `SergeantGuruV2 | HH:MMZ | ID: <interaction ID>`.

## 2.2.0 - 2026-11-13
- Authorized users can run 50 access-controlled commands per UTC day; the owner is exempt and `/info` shows the remaining allowance.
- Interaction log embeds show the user as a clickable mention, and `/search` still matches usernames via the footer.

## 2.1.1 - 2026-11-13
- `/info` and the `/data` Bot & API view show the running build version, so a stale process is obvious.
- The bot prints its version when it connects, and `/api/healthz` reports it too.

## 2.1.0 - 2026-11-13
- `/data` opens separate views from a menu: Overview, Access & Statistics, Bot & API, and Embed Colors.
- `/info` shows live Ollama status alongside the other integrations.
- Access control is enforced centrally: every command except the public `/admin` panel requires granted access, including the advanced badge-tracking button.

## 2.0.3 - 2026-11-13
- Test

## 2.0.2 - 2026-11-12
- Ollama is optional: the launcher no longer waits for it before starting the bot.
- `/grade` falls back to deterministic rubric grading and Alt Risk to the rule-based score when Ollama is unavailable.

## 2.0.1 - 2026-11-12
- Restored the grading rubric reference file omitted from the initial GitHub upload.

## 2.0.0 - 2026-11-12
- `/changelog` shows all recent updates without a version option.
- Started the release history at 2.0.0.
- Added Change Log embed color settings to `/admin`.
