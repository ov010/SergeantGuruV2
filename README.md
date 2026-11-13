# SergeantGuruV2

Requires Node.js 22.13+ and pnpm.

1. In PowerShell, run `pnpm.cmd install` in the VS Code terminal.
2. Open the `.env` file in the project root and fill in `DISCORD_BOT_TOKEN` and
   `ROBLOX_OPEN_CLOUD_API_KEY`. `PORT` defaults to `3000`. The XTracker key is
   optional. Trello boards are read publicly, so no Trello credentials are
   needed. Keep the `.env` file private.
3. From the project root, run `pnpm.cmd start` in the terminal, or press **F5**
   in **Run and Debug**. Both build and start the API server; it supervises the
   Discord bot.
4. Ollama is optional. The bot runs without it: grading falls back to the
   deterministic rubric and Alt Risk uses the rule-based score. For local AI
   review, install Ollama and keep it running. The project uses
   `OLLAMA_MODEL` from `.env` (currently `qwen2.5:0.5b`); pull it with
   `ollama pull qwen2.5:0.5b`, or point `OLLAMA_MODEL` at any other pulled model.
   In `/grade`, Ollama compares the submitted mistakes with the Google Sheet
   rubric, fills in matches the deterministic matcher misses, and fixes grammar.
   Every AI rubric match is verified against the sheet, saved feedback overrides
   always win, and grading falls back to the deterministic result when Ollama is
   unavailable. In `/background check`, Ollama contributes a second opinion to
   the Alt Risk score, which is based on every available signal: account age,
   badges, friends, followers, following, past usernames, groups and division
   ranks, avatar items, inventory items, game passes, created games, favourite
   games and record checks. The model never edits the Google Sheet or the rubric.
   The bot uses `127.0.0.1:11434` by default; `OLLAMA_BASE_URL` and
   `OLLAMA_MODEL` can be set in `.env` if needed.

The bot provides `/background check`, `/badge count`, `/grade`, `/api`,
`/groups`, `/records`, `/roblox`, and `/info`. `/records` is a focused lookup
that returns only the blacklist and Secret Service Trello records plus
[x]Tracker marks. `/roblox` uses Bloxlink to translate between Discord user IDs
and Roblox accounts. `/background check` and `/records` also accept a linked
Discord user ID in place of a Roblox username.
`/grade` posts its report as plain text, not an embed,
and capitalizes shortened rubric terms such as OOS, VB and PB while leaving
ordinary words and names alone. Its evaluation menu includes VIP Training,
Guarding Evaluation, Hosting Evaluation, and Host Rating; Host Rating collects
the host, event type, positives, and negatives, then produces a colored
`Rating: X/10 | PASS/FAIL` report. The Feedback button posts an embed with a
sheet-ready `[-] mistake - SEVERITY` row in channel `1569796036556234752` and
pings the owner so it can be pasted into the Google Sheet. All slash commands
are registered globally with guild, bot-DM, and private-channel contexts and
support guild install and user install, so they can also be used in Discord
DMs. DM use requires **Guild Install** and **User Install** to be enabled under
the application's **Installation** settings in the Discord Developer Portal.
`/api` runs live reachability checks for Discord, Roblox, XTracker,
Google Sheets, and Ollama. Each authorized user can run 50 access-controlled
commands per UTC day; the owner is exempt and `/info` shows what is left. The
owner can use `/admin` to open the access and color settings panel.
Authorization, daily usage, and settings remain in
`api-server/bot/data/authorizations.sqlite3`.

Any embed with more than fifteen lines of information is split across pages with
Previous and Next buttons; `/info`, `/data`, `/api`, `/changelog`, and `/search`
paginate. Pages target fifteen lines but keep the description and each field whole,
so a page can show more than fifteen lines when a related block needs it.
Interaction and grading-feedback logs are exempt: every log is sent as one
complete embed. The `/background check`, `/badge count`, `/groups`, and
`/records` reports are also sent as single embeds without pagination.
`/search` scans the full interaction-log history (up to 100,000 messages) and
returns every matching entry, not just the latest few; if the cap is reached,
the results say so. When `BLOXLINK_API_KEY` is set, `/search` also resolves
Discord user IDs to their linked Roblox account and Roblox usernames to their
linked Discord accounts, then includes those users' logs. `/roblox` shows the
resolved links directly. Set `BLOXLINK_API_KEY` in `.env` (or as a Codespaces
secret); without it the Bloxlink-powered parts return a clear configuration
message and the rest of the bot keeps working. Bloxlink API keys are
guild-scoped, so set `BLOXLINK_GUILD_ID` to the Discord server the key was
issued for (default `1566264464062414881`). Lookups that use a different server
return a message explaining the mismatch.
Every slash command and subcommand has a short description shown in Discord,
and the admin, data, and grade menus describe each choice. Every embed uses the
same footer, `SergeantGuruV2 | HH:MMZ | ID: <interaction ID>`, and the
interaction log gives clickable links to the server and channel (or DM) next to
their IDs.

The API health endpoint is `http://localhost:<PORT>/api/healthz`.

Use `/changelog` alone to see all recent updates, newest first. Release history
starts at 2.0.0; no version option is needed. Whenever making updates, add a
newest-first version and date entry with short description bullets to `CHANGELOG.md`.
