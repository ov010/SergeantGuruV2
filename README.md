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
4. For local AI review, install Ollama and keep it running. The project uses
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
`/groups`, and `/info`. `/grade` posts its report as plain text, not an embed,
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
Google Sheets, and Ollama. The owner can use `/admin` to open the access and
color settings panel. Authorization and settings remain in
`api-server/bot/data/authorizations.sqlite3`.

The API health endpoint is `http://localhost:<PORT>/api/healthz`.

Use `/changelog` for the latest release notes, or `/changelog version:1.1.0`
for a specific version. Whenever making updates, add a newest-first version
and date entry with short description bullets to `CHANGELOG.md`.
