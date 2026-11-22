# Change Log

## 3.3.0 - 2026-11-22
- `/admin` gained **Change bot status**, offering Online, Idle, Do Not Disturb and Invisible. The choice is saved and reapplied on startup and on every presence rotation.
- The optional Alt Risk model now receives the rule-based score and explains the strongest risk and mitigating signals in 2-4 sentences, with room for up to 500 characters.
- `/background check` ends with a small `-#` note that new public databases may be added in future updates.

## 3.2.2 - 2026-11-22
- The admin panel's authorized-user view now shows the user as a `<@ID>` mention and allows that mention, so viewing them pings the account instead of printing a plain username.

## 3.2.1 - 2026-11-22
- Bolded every labelled figure in `/background check` (`Roblox User ID`, `Account Created`, and the account, community and inventory stats) to match the punishment labels.
- The optional local alt-risk AI now backs off for five minutes after a connection failure and logs one short line instead of a stack trace on every background check, so hosts without Ollama stay quiet.

## 3.2.0 - 2026-11-22
- `/background check` now shows `None` for Roblox Watcher when it finds nothing, keeps the Roblox Watcher and Exploit Watcher labels small under the punishment records without dividers, renames the punishment entries to Blacklist Records, Secret Service Records and [x]Tracker Records with bold labels, and adds colons to the account, community and inventory figures.

## 3.1.9 - 2026-11-22
- `/background check` now renders each section title as a Markdown header so it appears larger like the account name, with all content in the embed description and a continuation embed when it outgrows one. Exploit Watcher shows `None` when it has nothing to report, and a flagged account without server details shows `None` under its mention.

## 3.1.8 - 2026-11-22
- Shortened the `/background check` section dividers so they no longer stretch across the full embed width.

## 3.1.7 - 2026-11-22
- `/background check` now separates every section with a full-width `═` divider and groups the account, community and inventory figures under one Roblox Account section.
- Inventory item and game-pass counts no longer stop at 1,000 and 500: they page up to 6,000 items and 2,000 game passes, and show a `+` when a count is still capped.

## 3.1.6 - 2026-11-22
- The linked-accounts header now shows only the account count and deduplicated mentions; link sources, watcher names and flag labels stay in the watcher sections. Evidence puts the account mention on its own line with the server details beneath it, and "last seen" uses Discord relative timestamps.

## 3.1.5 - 2026-11-22
- Moved the flagged-server evidence lines out of the linked-accounts header and into the matching Roblox Watcher and Exploit Watcher sections at the bottom of `/background check`, so the header keeps the mentioned accounts and the why stays with the records.

## 3.1.4 - 2026-11-22
- Linked Discord accounts in `/background check` now render as real user mentions, allowed only for the listed accounts, so they ping the linked users. The Exploit Watcher records remain at the bottom of the embed.

## 3.1.3 - 2026-11-22
- Flagged linked Discord accounts now explain the flag: the watcher's Discord lookup adds the flagged server, why that server is flagged, the messages, reactions or requests seen there, and when the account was last seen.

## 3.1.2 - 2026-11-22
- The linked Discord accounts under the Roblox account details now merge Roblox Watcher and Exploit Watcher, deduplicated by Discord ID, with every link source and the watcher that reported each account; a Roblox Watcher section is only shown when it has no linked accounts to contribute.

## 3.1.1 - 2026-11-22
- `/background check` now lists the Exploit Watcher Discord accounts directly under the Roblox user ID and creation date, instead of at the bottom inside the Exploit Watcher section.
- Fixed Exploit Watcher showing "Not flagged" for accounts whose linked Discord accounts are flagged but which have no injections of their own; the flagged linked accounts now mark the lookup as flagged.

## 3.1.0 - 2026-11-22
- Added an Exploit Watcher lookup to `/background check`: injection totals, the games that were injected, and linked Discord accounts with their flag state. `/api` and `/info` report the integration too. Set `EXPLOIT_WATCHER_API_KEY` to enable it.
- The empty Roblox Watcher result now says the lookup found nothing in its NSFW/condo server database, instead of implying the account was unknown.

## 3.0.1 - 2026-11-22
- Paginated embeds now keep their pages in the authorization database instead of only in memory, so Previous/Next keeps working for every member in the channel after a bot restart and is no longer limited to the user who ran the command.
- A failed in-place page update now shows the requested page to the person who clicked instead of failing the interaction.

## 3.0.0 - 2026-11-22
- Fixed the admin panel's authorized-user view: it now has its own embed color instead of failing with "No selectable color target", and it shows the user's display name, username, profile picture, Discord ID, authorization time, and who granted access.
- `/background check` now lays account, community, and inventory counts out in three compact columns, gives Alt Risk its own section, and keeps the wide ranks, punishment, and Roblox Watcher sections easy to scan.
- The ranks and division list in `/background check` and `/groups` now links every group name to its Roblox group page.
- Added a Roblox Watcher lookup to `/background check`: linked Discord accounts and how many are flagged. `/api` and `/info` report the integration too. Set `ROBLOX_WATCHER_API_KEY` to enable it.
- Added `/ping` for Discord gateway latency, round trip, uptime, and version.
- Removed `/data` and `/records` completely; blacklist, Secret Service, and [x]Tracker results now live only in `/background check`.

## 2.13.0 - 2026-11-22
- `/background check` now has a profile headshot, username and Roblox ID header, a clean account-created line, split sections for stats, ranks, and punishment records, and the badge chart at the bottom.
- Account stats now include friends, following, followers, game passes, inventory items, asset types, created and favourite games, badges, username changes, and an inventory link.
- `/badge count` now returns only the requested user's headshot, Roblox ID, account creation date, and badge chart.
- Removed the advanced badge-tracking button, activity summary, and its colour option.

## 2.12.0 - 2026-11-22
- The admin panel has a second dropdown listing every authorized user; selecting one shows their grant and usage and pings them as `<@id>`.
- Authorized users are capped at 10 access-controlled commands per UTC day (down from 50); the owner remains exempt. The per-command 5/day limits still apply.
- The one-minute cooldown now uses a live Discord `<t:...:R>` countdown instead of a fixed second count.

## 2.11.1 - 2026-11-22
- `/admin` now lists the exact authorized user and role IDs, and an authorization confirmation names the resolved user or role so a grant can be verified immediately.
- Access-denied and rate/daily-limit replies are now ephemeral, and the denial shows the invoker's Discord ID to compare with the grant. The bot logs the authorization database path at startup.

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
