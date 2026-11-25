# SergeantGuruV2

Requires Node.js 22.13+ and pnpm.

1. Install dependencies from the project root with `pnpm install`.
   pnpm normally links packages with symlinks, which exFAT and NTFS drives (a USB
   stick, for example) cannot store, so `pnpm-workspace.yaml` sets
   `nodeLinker: hoisted`. If `pnpm install` still reports a `.bin` symlink error
   on such a drive, the packages are installed and only the shims failed; an
   ext4 folder avoids the message entirely.
2. Open the `.env` file in the project root and fill in `DISCORD_BOT_TOKEN` and
   `ROBLOX_OPEN_CLOUD_API_KEY`. `PORT` defaults to `3000`. The XTracker, Roblox
   Watcher and Exploit Watcher keys are optional; without
   `ROBLOX_WATCHER_API_KEY` or `EXPLOIT_WATCHER_API_KEY` the background check
   says that check is not configured. Trello boards are read publicly, so no
   Trello credentials are needed. Keep the `.env` file private.
3. Start it with `bash "Start SergeantGuruV2.sh"`. The launcher checks Ollama,
   builds, and runs the API server, which supervises the Discord bot. You can
   also run `pnpm start`, or press **F5** in **Run and Debug**.
4. Ollama is optional and only used by Alt Risk. The bot runs without it: Alt
   Risk falls back to the rule-based score. For the local AI second opinion,
   install Ollama and keep it running. The project uses `OLLAMA_MODEL` from
   `.env` (currently `qwen2.5:1.5b`); pull it with `ollama pull qwen2.5:1.5b`,
   or point `OLLAMA_MODEL` at any other pulled model. Use a non-thinking
   instruct model: reasoning models such as `qwen3:4b` spend their whole
   response budget thinking and return no usable JSON.
   In `/background check`, Ollama contributes a second opinion to the Alt Risk
   score and explains the strongest risk and mitigating signals in a short
   analysis, which is based on every available signal: account age, badges,
   friends, followers, following, past usernames, groups and division ranks,
   avatar items, inventory items, game passes, created games, favourite games
   and record checks. The bot uses `127.0.0.1:11434` by default;
   `OLLAMA_BASE_URL` and `OLLAMA_MODEL` can be set in `.env` if needed.

The bot provides `/background check`, `/badge count`, `/api`, `/groups`,
`/profile`, `/info`, `/changelog`, `/search`, and `/ping`. `/background check`
requires both a Discord user ID and a Roblox username:
`/background check username:<Roblox username> discord:<id>`. The Discord ID is
used only for this report and is never saved by the bot. The report starts
with the Roblox Account section with its user ID, creation date, account,
friend and inventory figures, followed by a Discord Account section with
the mention above the username, display name, ID and Hammer Time creation
date. The Roblox headshot is the embed thumbnail; the report no longer shows a
Discord headshot or a `Discord: <username>` line at the top. Alt Risk, ranks,
Division History, the punishment record (blacklist, Secret Service and
[x]Tracker), Exploit Watcher's injection history, and the badge chart follow
below. Alt Risk shows the Roblox account
score, the Discord account score based on its age, and a combined score.
Division History reads the public CBRN divisional rank change time log and
lists each logged stint for the six divisions with join and leave dates as
Discord timestamps and the time spent there; an ongoing stint counts to the
current time. Every section is separated by a full-width divider line and
titled as a Markdown header so it renders larger like the account name; the content sits
in the embed description, and long results continue into a second embed. Every
embed in a multi-embed report keeps the same section order and formatting. The
account, friend and inventory figures share one Roblox Account section. The
punishment record groups
Blacklist Records, Secret Service Records and [x]Tracker Records, and the small
Roblox Watcher and Exploit Watcher labels show `None` when they have nothing
to report.
Linked accounts are rendered as mentions so they ping the linked Discord
users. Each watcher section at the bottom lists every flagged server behind
the accounts it reported, why each server is flagged, the account's standing
and roles, the date range it was seen there, and the activity recorded there:
messages, slash commands, reactions, voice joins, boosts and the exploit or
NSFW request counters. The linked-account line shows the link source, its
server count and its total activity score. Exploit Watcher's injection list
shows every injected game with its first and last injection date; the
Exploit Watcher records stay at the bottom of the embed. Inventory counts page
up to 6,000 items and 2,000 game passes, with a `+` when a count is still
capped.
`/ping` is public and reports Discord gateway latency, round trip and uptime;
every other command except `/admin` needs granted access. All slash commands
are registered globally with guild, bot-DM, and private-channel contexts and
support guild install and user install, so they can also be used in Discord
DMs. DM use requires **Guild Install** and **User Install** to be enabled under
the application's **Installation** settings in the Discord Developer Portal.
`/api` runs live reachability checks for Discord, Roblox, XTracker, and Roblox
Watcher. Each authorized user can run 10 access-controlled commands per UTC
day; the owner is exempt and `/info` shows what is left. The owner can use
`/admin` to open the access, bot status and color settings panel; its second
dropdown shows each authorized user's profile picture, Discord ID, who granted
access, and when. The bot status can be set to Online, Idle, Do Not Disturb or
Invisible and is saved across restarts.
Authorization, daily usage, and settings remain in
`api-server/bot/data/authorizations.sqlite3`.

**CyberGuard Helper password delivery.** The CyberGuard Helper website creates
a member's default password when the admin adds them. A member who has not
changed it yet enters their Roblox username and Discord ID on the site's login
page, the site queues the delivery, and SergeantGuruV2 DMs the default password
to that Discord account. The bot checks the queue every 15 seconds. Set
`CYBERGUARD_BASE_URL` (for example `https://cyberguard.example.com`) and
`CYBERGUARD_INTEGRATION_TOKEN` in `.env`, and set the same token on the Worker
as the `CYBERGUARD_INTEGRATION_TOKEN` secret (`npx wrangler secret put
CYBERGUARD_INTEGRATION_TOKEN`). Without both values the bot is unchanged and
only this delivery is off.

Any embed with more than fifteen lines of information is split across pages with
Previous and Next buttons; `/info`, `/changelog`, and `/search` paginate.
`/api` always sends all integration statuses in one embed. Any member can use
those buttons, and the page data is stored in the authorization database so
paging still works after a bot restart. Pages target fifteen lines but keep the description and each field whole,
so a page can show more than fifteen lines when a related block needs it.
Interaction logs are exempt: every log is sent as one complete embed. The
`/background check`, `/badge count`, `/groups`, and `/api` reports are also
sent as single embeds without pagination.
`/search` scans the full interaction-log history (up to 100,000 messages) and
returns every matching entry, not just the latest few; if the cap is reached,
the results say so.
Every slash command and subcommand has a short description shown in Discord,
and the admin and data menus describe each choice. Every embed uses the
same footer, `SergeantGuruV2 | HH:MMZ | ID: <interaction ID>`, and the
interaction log gives clickable links to the server and channel (or DM) next to
their IDs.

The API health endpoint is `http://localhost:<PORT>/api/healthz`.

Use `/changelog` alone to see all recent updates, newest first. Release history
starts at 2.0.0 and every release increments the patch number by one (2.0.1,
2.0.2, and so on) so no version is skipped; no version option is needed.
Whenever making updates, add a newest-first version and date entry with short
description bullets to `CHANGELOG.md`.
