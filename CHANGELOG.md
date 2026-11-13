# Change Log

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
