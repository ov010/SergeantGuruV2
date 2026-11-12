# Change Log

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
