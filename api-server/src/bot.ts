import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import {
  ActionRowBuilder,
  ActivityType,
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  InteractionContextType,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Interaction,
  type MessageActionRowComponentBuilder,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { discordTimestamp, fetchRobloxAvatar, formatChartCount, makeBadgeChart } from "./badge-chart";
import { assessAltRisk } from "./bot-alt-ai";
import { credentialEmbed, startCredentialDelivery } from "./cyberguard-credentials";
import { brandFooter } from "./lib/brand";
import packageJson from "../../package.json";

export { formatChartCount, makeBadgeChart };
export const BOT_VERSION: string = packageJson.version;
export { parseAltAssessment } from "./bot-alt-ai";
export { credentialDmEmbed, parseCredentialDeliveries } from "./cyberguard-credentials";

const OWNER_ID = "1186370477606838375";
const ROBLOX_CLOUD = "https://apis.roblox.com/cloud/v2";
const ROBLOX_USERS = "https://users.roblox.com/v1";
const ROBLOX_GROUPS = "https://groups.roblox.com/v2/users";
const ROBLOX_FRIENDS = "https://friends.roblox.com/v1/users";
const ROBLOX_GAMES = "https://games.roblox.com/v2/users";
const ROBLOX_AVATAR = "https://avatar.roblox.com/v1/users";
const TRELLO_API = "https://api.trello.com/1";
const XTRACKER_API = "https://api.xtracker.xyz";
const ROBLOX_WATCHER_API = "https://api.robloxwatcher.com/api/v1/robloxwatcher";
const EXPLOIT_WATCHER_API = "https://api.robloxwatcher.com/api/v1/exploitwatcher";
const BLACKLIST_BOARD = "gsCa53Bt";
const SECRET_SERVICE_BOARD = "xgGFFrH3";
const DIVISION_HISTORY_SHEET_ID = "1GXA3k6xLQrKyC6M2MUdrC2Ld75Nlx_deVJL9rWvVZPo";
const DIVISION_HISTORY_CACHE_SECONDS = 15 * 60;
const DIVISION_HISTORY_TABS = [
  { division: "Army", code: "Army", tab: "Army-RobloxHistory" },
  { division: "Cyberguard", code: "CG", tab: "CG-RobloxHistory" },
  { division: "Flame Troopers", code: "FT", tab: "FT-RobloxHistory" },
  { division: "Special Forces", code: "SF", tab: "SF-RobloxHistory" },
  { division: "Border Operations", code: "BO", tab: "BO-RobloxHistory" },
  { division: "Secret Service", code: "SS", tab: "SS-RobloxHistory" },
] as const;
const NONE = "None";
const SECTION_DIVIDER = "═".repeat(24);
const MAX_RATE_LIMIT_RETRIES = 5;
const BACKGROUND_CHECK_TIMEOUT_MS = 60_000;
const DATA_DIR = fileURLToPath(new URL("../bot/data/", import.meta.url));
const CHANGELOG_PATH = fileURLToPath(new URL("../../CHANGELOG.md", import.meta.url));
const CACHE_DIR = path.join(DATA_DIR, "cache");
const AUTH_DB_PATH = process.env["BOT_AUTH_DB_PATH"]?.trim() || path.join(DATA_DIR, "authorizations.sqlite3");
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const startTime = Date.now();
mkdirSync(DATA_DIR, { recursive: true });

const token = process.env["DISCORD_BOT_TOKEN"]?.trim();
const robloxApiKey = process.env["ROBLOX_OPEN_CLOUD_API_KEY"]?.trim();
if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");
if (!robloxApiKey) throw new Error("ROBLOX_OPEN_CLOUD_API_KEY is required.");
const xtrackerApiKey = process.env["XTRACKER_API_KEY"]?.trim() ?? "";
const robloxWatcherApiKey = process.env["ROBLOX_WATCHER_API_KEY"]?.trim() ?? "";
const exploitWatcherApiKey = process.env["EXPLOIT_WATCHER_API_KEY"]?.trim() ?? "";
const altAiBaseUrl = process.env["OLLAMA_BASE_URL"]?.trim() || "http://127.0.0.1:11434";
const altAiModel = process.env["OLLAMA_MODEL"]?.trim() || "qwen2.5:1.5b";
const ALT_AI_RETRY_MS = 5 * 60_000;
let altAiRetryAt = 0;

// Optional bridge to CyberGuard Helper: the bot DMs the default password that
// the website queues when a member asks for theirs.
const cyberGuardBaseUrl = (process.env["CYBERGUARD_BASE_URL"]?.trim() ?? "").replace(/\/+$/, "");
const cyberGuardToken = process.env["CYBERGUARD_INTEGRATION_TOKEN"]?.trim() ?? "";
let stopCredentialDelivery: (() => void) | undefined;

const BACKGROUND_CHECK_LOG_GUILD_ID = "1566264464062414881";
const BACKGROUND_CHECK_LOG_CHANNEL_ID = "1566264530361655387";

const CHART_COLORS: Record<string, [string, string]> = {
  Blurple: ["#5865f2", "#8ea1e1"],
  Purple: ["#8b7bff", "#b8adff"],
  Blue: ["#3b82f6", "#93c5fd"],
  Green: ["#22c55e", "#86efac"],
  Red: ["#ef4444", "#fca5a5"],
  Orange: ["#f97316", "#fdba74"],
  Yellow: ["#eab308", "#fde047"],
  Pink: ["#ec4899", "#f9a8d4"],
  Teal: ["#14b8a6", "#5eead4"],
};
const DEFAULT_CHART_COLOR = "Yellow";
const DEFAULT_PRESENCE = "SergeantGuruV2 | Use /background check";
const PRESENCE_ROTATION_INTERVAL_MS = 30_000;
const PRESENCE_STATUSES = ["online", "idle", "dnd", "invisible"] as const;
type PresenceStatus = (typeof PRESENCE_STATUSES)[number];
const PRESENCE_STATUS_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible",
};
const DEFAULT_PRESENCE_STATUS: PresenceStatus = "online";
const EMBED_ROLES: Record<string, [string, string]> = {
  "Background Check": ["embed_color_background_check", "Blurple"],
  "Badge Count": ["embed_color_badge_count", "Yellow"],
  "CBRN Groups": ["embed_color_groups", "Blue"],
  "Profile": ["embed_color_profile", "Blue"],
  "Could Not Load Profile": ["embed_color_profile_error", "Orange"],
  "Bot Interaction": ["embed_color_interaction_log", "Blurple"],
  "Access Denied": ["embed_color_access_denied", "Red"],
  "Admin Panel": ["embed_color_admin_panel", "Blurple"],
  "Authorized User": ["embed_color_authorized_user", "Blurple"],
  "Change Embed Colors": ["embed_color_admin_color_menu", "Blurple"],
  "Choose Embed Color": ["embed_color_admin_choose_color", "Blurple"],
  "Rate Limit Exceeded": ["embed_color_rate_limit", "Orange"],
  "Daily Limit Reached": ["embed_color_daily_limit", "Orange"],
  "Invalid Roblox Username": ["embed_color_invalid_username", "Orange"],
  "Invalid Background Query": ["embed_color_background_query_invalid", "Orange"],
  "Background Check Timed Out": ["embed_color_background_timeout", "Orange"],
  "Could Not Look Up User": ["embed_color_lookup_error", "Orange"],
  "Could Not Load Groups": ["embed_color_groups_error", "Orange"],
  "Badge Count Timed Out": ["embed_color_badge_timeout", "Orange"],
  "Could Not Load Badge Count": ["embed_color_badge_error", "Orange"],
  "Server Required": ["embed_color_server_required", "Orange"],
  "Bot Information": ["embed_color_bot_information", "Blurple"],
  "Ping": ["embed_color_ping", "Teal"],
  "Change Log": ["embed_color_changelog", "Blue"],
  "Change Log Unavailable": ["embed_color_changelog_error", "Orange"],
  "Password Reset": ["embed_color_password_reset", "Teal"],
  "Password Reset Unavailable": ["embed_color_password_reset_error", "Orange"],
  "API Status": ["embed_color_api_status", "Blue"],
  "Bot Status": ["embed_color_bot_status", "Teal"],
  "Bot Status Updated": ["embed_color_bot_status_result", "Green"],
  "Invalid Search Query": ["embed_color_search_invalid", "Orange"],
  "No Interactions Found": ["embed_color_search_empty", "Orange"],
  "Interaction Search Results": ["embed_color_search_results", "Green"],
  "Embed Colors Updated": ["embed_color_admin_color_result", "Green"],
  "Rotating Presence Updated": ["embed_color_presence_result", "Green"],
  "Authorization Updated": ["embed_color_authorization_result", "Green"],
  "Command Error": ["embed_color_command_error", "Red"],
};
const EMBED_TITLE_ROLES: Record<string, string> = {
  "Access Denied": "Access Denied",
  "Admin Panel": "Admin Panel",
  "Change Embed Colors": "Change Embed Colors",
  "Choose Embed Color": "Choose Embed Color",
};
const GROUP_IDS = new Set([
  32619026, 32581846, 16442214, 6053142, 6053141, 6053136, 13691580, 5855434,
]);

const db = new DatabaseSync(AUTH_DB_PATH);
// WAL plus a busy timeout keeps a second process (or a test run) from failing with "database is locked".
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS authorized_users (
    discord_user_id TEXT PRIMARY KEY, authorized_by TEXT NOT NULL,
    authorized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS authorized_roles (
    discord_role_id TEXT PRIMARY KEY, authorized_by TEXT NOT NULL,
    authorized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  DROP TABLE IF EXISTS discord_links;
  CREATE TABLE IF NOT EXISTS pagination_sessions (
    token TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_command_usage (
    discord_user_id TEXT NOT NULL,
    usage_day TEXT NOT NULL,
    command_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (discord_user_id, usage_day)
  );
  CREATE TABLE IF NOT EXISTS command_daily_usage (
    discord_user_id TEXT NOT NULL,
    usage_day TEXT NOT NULL,
    command_name TEXT NOT NULL,
    command_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (discord_user_id, usage_day, command_name)
  );
  INSERT OR IGNORE INTO authorized_users (discord_user_id, authorized_by)
  VALUES ('${OWNER_ID}', '${OWNER_ID}');
`);

type JsonObject = Record<string, any>;
type BadgeDate = Date;
class BotError extends Error {}
class PrivateInventoryError extends BotError {}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] },
});
const lastCommandAt = new Map<string, number>();
const interactionContext = new AsyncLocalStorage<string>();

function log(message: string, error?: unknown) {
  if (error) console.error(`[badge-bot] ${message}`, error);
  else console.log(`[badge-bot] ${message}`);
}

// Keep user-facing failures readable even when a thrown value has no message.
function errorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message || fallback;
}

async function sendLogEmbed(embed: EmbedBuilder): Promise<void> {
  if (!client.isReady()) throw new Error("Discord client is not ready to send a log entry.");
  const guild = await client.guilds.fetch(BACKGROUND_CHECK_LOG_GUILD_ID);
  const channel = await guild.channels.fetch(BACKGROUND_CHECK_LOG_CHANNEL_ID);
  if (!channel || !("send" in channel)) {
    throw new Error(`Log channel ${BACKGROUND_CHECK_LOG_CHANNEL_ID} was not available.`);
  }
  // Logs are audit records: always send the whole entry as one embed instead of
  // splitting it across paginated pages.
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

function getSetting(key: string, fallback: string): string {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? fallback;
}

function setSetting(key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function embedColor(role: string): number {
  const setting = EMBED_ROLES[role];
  if (!setting) throw new Error(`No color setting is configured for embed: ${role}`);
  const [key, fallback] = setting;
  const color = getSetting(key, fallback);
  const hex = CHART_COLORS[color]?.[0] ?? CHART_COLORS[fallback]![0];
  return Number.parseInt(hex.slice(1), 16);
}

function footer(): string {
  return brandFooter(interactionContext.getStore());
}

export function runWithInteractionId<T>(interactionId: string, callback: () => T): T {
  return interactionContext.run(interactionId, callback);
}

// Pages target PAGE_LINE_LIMIT lines, but logical blocks (the description or one
// field) are never split, so a page may hold more than the target to keep
// related information together.
export const PAGE_LINE_LIMIT = 15;
const PAGINATION_TTL_MS = 15 * 60 * 1000;
type PaginationRow = ActionRowBuilder<MessageActionRowComponentBuilder>;

interface PaginationSession {
  pages: EmbedBuilder[];
  createdAt: number;
  extraRows: PaginationRow[];
}

const paginationSessions = new Map<string, PaginationSession>();

// Paginated results live in SQLite as well as memory: the interaction response
// outlives a bot restart, so anyone in the channel must still be able to page it
// afterwards, not only the user who ran the command.
function savePaginationSession(token: string, session: PaginationSession): void {
  try {
    const payload = JSON.stringify({
      pages: session.pages.map((page) => page.toJSON()),
      extraRows: session.extraRows.map((row) => row.toJSON()),
      createdAt: session.createdAt,
    });
    db.prepare("INSERT OR REPLACE INTO pagination_sessions (token, payload, created_at) VALUES (?, ?, ?)")
      .run(token, payload, session.createdAt);
  } catch (error) {
    log("Unable to save the pagination session", error);
  }
}

function deletePaginationSession(token: string): void {
  paginationSessions.delete(token);
  try {
    db.prepare("DELETE FROM pagination_sessions WHERE token = ?").run(token);
  } catch (error) {
    log("Unable to delete the pagination session", error);
  }
}

export function restorePaginationSession(token: string): PaginationSession | undefined {
  try {
    const row = db.prepare("SELECT payload, created_at FROM pagination_sessions WHERE token = ?")
      .get(token) as { payload: string; created_at: number } | undefined;
    if (!row) return undefined;
    if (Date.now() - Number(row.created_at) > PAGINATION_TTL_MS) {
      deletePaginationSession(token);
      return undefined;
    }
    const data = JSON.parse(row.payload) as { pages: JsonObject[]; extraRows: JsonObject[]; createdAt: number };
    const session: PaginationSession = {
      pages: data.pages.map((page) => EmbedBuilder.from(page)),
      // The payload was produced by ActionRowBuilder#toJSON, so it round-trips.
      extraRows: data.extraRows.map((row) => ActionRowBuilder.from(row as never) as PaginationRow),
      createdAt: Number(data.createdAt),
    };
    paginationSessions.set(token, session);
    return session;
  } catch (error) {
    log("Unable to restore the pagination session", error);
    return undefined;
  }
}

function pagedTitle(title: string | undefined, page: number, total: number): string {
  const base = (title ?? "").replace(/\s*\(Page \d+\/\d+\)$/, "").trim();
  return `${base ? `${base} ` : ""}(Page ${page}/${total})`.slice(0, 256);
}

export function paginateEmbed(embed: EmbedBuilder): EmbedBuilder[] {
  const data = embed.toJSON();
  type Block =
    | { kind: "description"; lines: string[] }
    | { kind: "field"; name: string; lines: string[]; inline: boolean };
  const blocks: Block[] = [];

  if (data.description) {
    const lines = data.description.split(/\r?\n/);
    while (lines.length && !lines.at(-1)!.trim()) lines.pop();
    if (lines.length) blocks.push({ kind: "description", lines });
  }
  for (const field of data.fields ?? []) {
    blocks.push({
      kind: "field",
      name: field.name,
      lines: (field.value ?? "").split(/\r?\n/),
      inline: field.inline ?? false,
    });
  }

  const totalLines = blocks.reduce((sum, block) => sum + Math.max(1, block.lines.length), 0);
  if (totalLines <= PAGE_LINE_LIMIT) return [embed];

  const pageBlocks: Block[][] = [];
  let current: Block[] = [];
  let currentLines = 0;
  for (const block of blocks) {
    const blockLines = Math.max(1, block.lines.length);
    if (current.length && currentLines + blockLines > PAGE_LINE_LIMIT) {
      pageBlocks.push(current);
      current = [];
      currentLines = 0;
    }
    current.push(block);
    currentLines += blockLines;
  }
  if (current.length) pageBlocks.push(current);
  // Do not give one trailing field a page of its own when the page before it
  // still fits the target; joined, the last statuses stay with the others.
  const lastPage = pageBlocks.at(-1);
  const previousPage = pageBlocks.at(-2);
  if (lastPage?.length === 1 && lastPage[0]?.kind === "field" && previousPage) {
    const previousLines = previousPage.reduce((sum, block) => sum + Math.max(1, block.lines.length), 0);
    if (previousLines <= PAGE_LINE_LIMIT) {
      previousPage.push(...lastPage);
      pageBlocks.pop();
    }
  }
  if (pageBlocks.length <= 1) return [embed];

  return pageBlocks.map((group, index) => {
    const description = group.find((block): block is Extract<Block, { kind: "description" }> => block.kind === "description");
    const fields = group.filter((block): block is Extract<Block, { kind: "field" }> => block.kind === "field");
    const page = EmbedBuilder.from(data)
      .setTitle(pagedTitle(data.title, index + 1, pageBlocks.length))
      .setDescription(description ? description.lines.join("\n").slice(0, 4096) : null)
      .setFields(fields.map((field) => ({
        name: field.name.slice(0, 256),
        value: field.lines.join("\n").slice(0, 1024) || "\u200b",
        inline: field.inline,
      })));
    // Attachments such as the badge chart belong on the first page only.
    if (index) page.setImage(null);
    return page;
  });
}

function paginationRow(token: string, page: number, total: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pager:${token}:${page - 1}`)
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`pager:${token}:${page + 1}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total - 1),
  );
}

export function buildPagination(
  embed: EmbedBuilder,
  extraRows: PaginationRow[] = [],
): { embeds: EmbedBuilder[]; components: PaginationRow[] } {
  return buildPaginationFromPages(paginateEmbed(embed), extraRows);
}

// Accepts pre-split pages (such as search results) so builders never exceed
// Discord's 25-field-per-embed limit before pagination runs.
export function buildPaginationFromPages(
  pages: EmbedBuilder[],
  extraRows: PaginationRow[] = [],
): { embeds: EmbedBuilder[]; components: PaginationRow[] } {
  if (pages.length <= 1) return { embeds: pages, components: extraRows };
  const titledPages = pages.map((page, index) => {
    const data = page.toJSON();
    return EmbedBuilder.from(data).setTitle(pagedTitle(data.title, index + 1, pages.length));
  });
  const token = randomBytes(9).toString("hex");
  if (paginationSessions.size >= 1000) {
    const oldest = paginationSessions.keys().next().value;
    if (oldest) deletePaginationSession(oldest);
  }
  const session = { pages: titledPages, createdAt: Date.now(), extraRows };
  paginationSessions.set(token, session);
  savePaginationSession(token, session);
  return {
    embeds: [titledPages[0]!],
    components: [paginationRow(token, 0, titledPages.length) as PaginationRow, ...extraRows],
  };
}

function makeEmbed(title: string, description: string, _colorRole: string): EmbedBuilder {
  let titleRole = EMBED_TITLE_ROLES[title];
  if (!titleRole && Object.hasOwn(EMBED_ROLES, title)) titleRole = title;
  if (!titleRole) throw new Error(`No selectable color target is configured for embed: ${title}`);
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(embedColor(titleRole)).setFooter({ text: footer() });
}

function deniedEmbed(hint?: string): EmbedBuilder {
  const embed = makeEmbed("Access Denied", "You do not have permission to use this command.", "Error");
  if (hint) embed.addFields({ name: "Need access?", value: hint });
  return embed;
}

function authorized(userId: string, roles: string[] = []): boolean {
  if (userId === OWNER_ID) return true;
  if (db.prepare("SELECT 1 FROM authorized_users WHERE discord_user_id = ?").get(userId)) return true;
  return roles.some((id) => db.prepare("SELECT 1 FROM authorized_roles WHERE discord_role_id = ?").get(id));
}

function memberRoles(member: { roles: unknown } | null): string[] {
  if (!member) return [];
  if (Array.isArray(member.roles)) return member.roles.map(String);
  const cachedRoles = member.roles as { cache?: { keys(): IterableIterator<string> } };
  return cachedRoles.cache ? [...cachedRoles.cache.keys()] : [];
}

function validateDiscordId(value: string): string {
  const id = value.trim();
  if (!/^\d{15,22}$/.test(id)) throw new Error("Enter a valid Discord ID containing only digits.");
  return id;
}

function validateUsername(username: string): string {
  const value = username.trim();
  if (!value || value.length > 20) throw new Error("Enter a Roblox username between 1 and 20 characters.");
  if (value.length < 3) throw new Error("Roblox usernames must be at least 3 characters long.");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) throw new Error("Roblox usernames can only contain letters, numbers, and underscores.");
  if (value.includes("__")) throw new Error("Roblox usernames cannot contain consecutive underscores.");
  if (value.startsWith("_") || value.endsWith("_")) throw new Error("Roblox usernames cannot start or end with an underscore.");
  return value;
}

function authorizationDate(value: string): Date | undefined {
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export interface AuthorizedUserView {
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  authorizedAt: string;
  authorizedById: string;
  authorizedByName?: string;
  daily: DailyCommandUsage;
  perCommand: CommandDailyUsage[];
}

export function createAuthorizedUserEmbed(view: AuthorizedUserView): EmbedBuilder {
  const authorizedAt = authorizationDate(view.authorizedAt);
  const authorizedLabel = authorizedAt
    ? `${discordTimestamp(authorizedAt, "F")}\n${discordTimestamp(authorizedAt, "R")}`
    : view.authorizedAt;
  const embed = makeEmbed(
    "Authorized User",
    [`**${view.displayName ?? view.username ?? "Unknown user"}**`, `<@${view.userId}>`].join("\n"),
    "Info",
  );
  if (view.avatarUrl) embed.setThumbnail(view.avatarUrl);
  embed.addFields(
    { name: "Discord ID", value: `\`${view.userId}\``, inline: true },
    { name: "Authorized", value: authorizedLabel, inline: true },
    {
      name: "Authorized By",
      value: view.authorizedById === view.userId
        ? "Self-authorized"
        : `${view.authorizedByName ? `${view.authorizedByName} ` : ""}(\`${view.authorizedById}\`)`,
      inline: true,
    },
    {
      name: "Commands Today",
      value: `${view.daily.used}/${view.daily.limit}\nResets ${discordTimestamp(view.daily.resetAt, "R")}`,
      inline: true,
    },
    {
      name: "Per-command Limits",
      value: view.perCommand.map((usage) => `${usage.label}: ${usage.used}/${usage.limit}`).join("\n") || NONE,
      inline: false,
    },
  );
  return embed;
}

function authorizationTargetLabel(type: "user" | "role", id: string): string {
  if (type === "user") {
    const user = client.users.cache.get(id);
    return user ? `${user.tag} (${id})` : `Discord user ${id}`;
  }
  const role = [...client.guilds.cache.values()]
    .map((guild) => guild.roles.cache.get(id))
    .find((candidate) => Boolean(candidate));
  return role ? `${role.name} (${id})` : `Discord role ${id}`;
}

function addAuthorization(table: "authorized_users" | "authorized_roles", id: string): boolean {
  const column = table === "authorized_users" ? "discord_user_id" : "discord_role_id";
  const result = db.prepare(`INSERT OR IGNORE INTO ${table} (${column}, authorized_by) VALUES (?, ?)`).run(id, OWNER_ID);
  return result.changes > 0;
}

function removeAuthorization(table: "authorized_users" | "authorized_roles", id: string): boolean {
  const column = table === "authorized_users" ? "discord_user_id" : "discord_role_id";
  return db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(id).changes > 0;
}

function adminPanelList(lines: string[]): string {
  const value = formatDataList(lines, lines.length);
  return value.length <= 1024 ? value : `${value.slice(0, 1023)}…`;
}

function createAdminPanelEmbed(): EmbedBuilder {
  const users = authorizedUserLines();
  const roles = authorizedRoleLines();
  const embed = makeEmbed("Admin Panel", "Only the bot owner can open this panel.", "Info");
  embed.addFields(
    { name: `Authorized users (${users.length})`, value: adminPanelList(users), inline: false },
    { name: `Authorized roles (${roles.length})`, value: adminPanelList(roles), inline: false },
  );
  return embed;
}

export function createAdminPanelMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("admin-panel")
    .setPlaceholder("Choose an admin action")
    .addOptions(
      { label: "Authorize user", value: "authorize-user", description: "Grant one Discord user access to the bot." },
      { label: "Authorize role", value: "authorize-role", description: "Grant every member with a role access." },
      { label: "Deauthorize user", value: "deauthorize-user", description: "Remove access from one Discord user." },
      { label: "Deauthorize role", value: "deauthorize-role", description: "Remove access from a role." },
      { label: "Change colors", value: "customize", description: "Change embed and chart colors." },
      { label: "Change bot status", value: "status", description: "Set Online, Idle, Do Not Disturb, or Invisible." },
      { label: "Change rotating presence", value: "presence", description: "Edit the bot's rotating status messages." },
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function createStatusMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("admin-status")
    .setPlaceholder("Choose the bot's status")
    .addOptions(PRESENCE_STATUSES.map((status) => ({
      label: PRESENCE_STATUS_LABELS[status],
      value: status,
      default: status === getPresenceStatus(),
    })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function createAuthorizedUsersMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const rows = db.prepare(
    "SELECT discord_user_id, authorized_by, authorized_at FROM authorized_users ORDER BY authorized_at, discord_user_id",
  ).all() as Array<{ discord_user_id: string; authorized_by: string; authorized_at: string }>;
  const shown = rows.slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("admin-authorized-user")
    .setPlaceholder(rows.length > shown.length
      ? `View an authorized user (${shown.length} of ${rows.length})`
      : "View an authorized user")
    .setDisabled(shown.length === 0);
  if (shown.length) {
    menu.addOptions(shown.map((row) => {
      const user = client.users.cache.get(row.discord_user_id);
      return {
        label: (user?.username ?? `User ${row.discord_user_id}`).slice(0, 100),
        description: `${row.discord_user_id} • authorized ${row.authorized_at}`.slice(0, 100),
        value: row.discord_user_id,
      };
    }));
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export const COLOR_TARGETS = ["Badge Chart", ...Object.keys(EMBED_ROLES)];
// Discord allows 25 select options. Reserve two slots for the previous/next
// navigation on middle pages, so every page stays within the limit.
export const COLOR_TARGET_PAGE_SIZE = 23;
const COLOR_TARGET_NEXT = "__next__";
const COLOR_TARGET_PREVIOUS = "__previous__";

function colorSetting(target: string): { key: string; fallback: string } | undefined {
  if (target === "Badge Chart") return { key: "chart_color", fallback: DEFAULT_CHART_COLOR };
  const setting = Object.hasOwn(EMBED_ROLES, target) ? EMBED_ROLES[target] : undefined;
  return setting ? { key: setting[0], fallback: setting[1] } : undefined;
}

function getPresenceActivities(): string[] {
  return getSetting("presence_rotation", DEFAULT_PRESENCE)
    .split(/\r?\n/)
    .map((activity) => activity.trim())
    .filter(Boolean);
}

function getPresenceStatus(): PresenceStatus {
  const value = getSetting("bot_status", DEFAULT_PRESENCE_STATUS);
  return (PRESENCE_STATUSES as readonly string[]).includes(value) ? value as PresenceStatus : DEFAULT_PRESENCE_STATUS;
}

function validatePresenceActivities(value: string): string[] {
  const activities = value.split(/\r?\n/).map((activity) => activity.trim()).filter(Boolean);
  if (!activities.length) throw new BotError("Enter at least one presence activity.");
  if (activities.length > 20) throw new BotError("Enter no more than 20 presence activities.");
  if (activities.some((activity) => activity.length > 128)) {
    throw new BotError("Each presence activity must be 128 characters or fewer.");
  }
  return activities;
}

let presenceIndex = 0;
let presenceTimer: ReturnType<typeof setInterval> | undefined;

function applyRotatingPresence(): void {
  if (!client.user) return;
  const activities = getPresenceActivities();
  if (!activities.length) throw new Error("At least one presence activity must be configured.");
  client.user.setPresence({
    activities: [{ name: activities[presenceIndex % activities.length]!, type: ActivityType.Playing }],
    status: getPresenceStatus(),
  });
  presenceIndex = (presenceIndex + 1) % activities.length;
}

function startRotatingPresence(): void {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceIndex = 0;
  applyRotatingPresence();
  presenceTimer = setInterval(applyRotatingPresence, PRESENCE_ROTATION_INTERVAL_MS);
  presenceTimer.unref();
}

export function createColorTargetMenu(page = 0): ActionRowBuilder<StringSelectMenuBuilder> {
  const lastPage = Math.ceil(COLOR_TARGETS.length / COLOR_TARGET_PAGE_SIZE) - 1;
  if (!Number.isInteger(page) || page < 0 || page > lastPage) throw new Error("Choose a valid embed color page.");
  const targets = COLOR_TARGETS.slice(page * COLOR_TARGET_PAGE_SIZE, (page + 1) * COLOR_TARGET_PAGE_SIZE);
  const options: { label: string; value: string; description?: string }[] = targets.map((target) => {
    const setting = colorSetting(target);
    return {
      label: target,
      value: target,
      ...(setting ? { description: `Current color: ${getSetting(setting.key, setting.fallback)}` } : {}),
    };
  });
  if (page > 0) options.push({ label: "Previous page", value: COLOR_TARGET_PREVIOUS, description: `Page ${page} of ${lastPage + 1}` });
  if (page < lastPage) options.push({ label: "Next page", value: COLOR_TARGET_NEXT, description: `Page ${page + 2} of ${lastPage + 1}` });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`admin-color-target:${page}`)
    .setPlaceholder(`Choose an embed to recolor (page ${page + 1}/${lastPage + 1})`)
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function createColorMenu(target: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const setting = colorSetting(target);
  if (!setting) throw new Error("Choose a valid embed color target.");
  const currentColor = getSetting(setting.key, setting.fallback);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`admin-color-value:${target}`)
    .setPlaceholder(`Choose a color for ${target}`)
    .addOptions(Object.entries(CHART_COLORS).map(([name, [hex]]) => ({
      label: name,
      value: name,
      description: hex,
      ...(currentColor === name ? { default: true } : {}),
    })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function createAdminModal(action: string): ModalBuilder {
  if (action === "presence") {
    return new ModalBuilder()
      .setCustomId("admin-panel:presence")
      .setTitle("Change Rotating Presence")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("activities")
            .setLabel("Activity text (one per line, up to 20)")
            .setPlaceholder(DEFAULT_PRESENCE)
            .setValue(getSetting("presence_rotation", DEFAULT_PRESENCE))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000),
        ),
      );
  }
  const modal = new ModalBuilder()
    .setCustomId(`admin-panel:${action}`)
    .setTitle(`${action.startsWith("deauthorize") ? "Deauthorize" : "Authorize"} ${action.endsWith("role") ? "Role" : "User"}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("discord_id")
          .setLabel("Discord ID")
          .setPlaceholder("Enter the numeric user or role ID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(15)
          .setMaxLength(22),
      ),
    );
  return modal;
}

function validateRobloxUsername(username: string): string {
  try {
    return validateUsername(username);
  } catch (error) {
    throw new BotError(error instanceof Error ? error.message : "Invalid Roblox username.");
  }
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${createHash("sha256").update(key).digest("hex")}.json.gz`);
}

async function getCached<T>(key: string, ttlSeconds: number): Promise<T | undefined> {
  const file = cachePath(key);
  try {
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > ttlSeconds * 1000) {
      await rm(file, { force: true });
      return undefined;
    }
    return JSON.parse((await gunzipAsync(await readFile(file))).toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

async function setCached(key: string, value: unknown): Promise<void> {
  const file = cachePath(key);
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(temporary, await gzipAsync(JSON.stringify(value)));
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    log("Unable to write cache entry", error);
  }
}

async function cleanupCache(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const threshold = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of await readdir(CACHE_DIR)) {
    const file = path.join(CACHE_DIR, name);
    try {
      if ((await stat(file)).mtimeMs < threshold) await rm(file, { force: true });
    } catch (error) {
      log(`Unable to remove cache entry ${name}`, error);
    }
  }
}

async function requestJson(url: string, init: RequestInit = {}, roblox = false): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    let response: Response;
    try {
      const requestSignal = init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(45_000)])
        : AbortSignal.timeout(45_000);
      response = await fetch(url, { ...init, signal: requestSignal });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new BotError("The request timed out. Please try again later.");
      throw new BotError(`${roblox ? "Roblox" : "The service"} could not be reached right now. Please try again later.`);
    }
    if (response.status !== 429) return response;
    if (attempt === MAX_RATE_LIMIT_RETRIES) throw new BotError("Roblox is rate-limiting requests. Please try again in a few minutes.");
    const retryAfter = Number(response.headers.get("retry-after") ?? 5);
    await delay(Math.max(1000, Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000, 60_000)), undefined,
      init.signal ? { signal: init.signal } : undefined);
  }
  throw new BotError("Roblox could not complete this request.");
}

async function robloxJson(url: string, init: RequestInit = {}): Promise<JsonObject> {
  const response = await requestJson(url, init, true);
  if (!response.ok) throw new BotError(`Roblox could not complete the request (HTTP ${response.status}).`);
  return await response.json() as JsonObject;
}

async function resolveUser(username: string, signal?: AbortSignal): Promise<{ id: string; name: string }> {
  const payload = await robloxJson(`${ROBLOX_USERS}/usernames/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    signal,
  });
  const user = payload.data?.[0];
  if (!user) throw new BotError(`No Roblox user was found for ${username}.`);
  return { id: String(user.id), name: String(user.name) };
}

// Discord snowflakes are 15-22 digits. Shorter numbers are treated as Roblox
// usernames so existing lookups keep working unchanged.
export function isDiscordUserId(value: string): boolean {
  return /^\d{15,22}$/.test(value.trim());
}

// Discord IDs can arrive as raw digits or as a mention pasted from the ticket.
export function parseDiscordId(value: string): string | undefined {
  const trimmed = value.trim();
  const mention = trimmed.match(/^<@!?(\d{15,22})>$/);
  if (mention) return mention[1];
  return isDiscordUserId(trimmed) ? trimmed : undefined;
}

async function cachedRoblox<T>(key: string, ttl: number, fetcher: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw signal.reason;
  const cached = await getCached<T>(key, ttl);
  if (cached !== undefined) return cached;
  const value = await fetcher();
  if (signal?.aborted) throw signal.reason;
  await setCached(key, value);
  return value;
}

async function fetchGroups(userId: string, signal?: AbortSignal): Promise<JsonObject[]> {
  return cachedRoblox(`user_groups:${userId}`, 1800, async () => {
    const data = await robloxJson(`${ROBLOX_GROUPS}/${userId}/groups/roles?limit=100`, { signal });
    return data.data ?? [];
  }, signal);
}

async function fetchProfileDetails(userId: string, signal?: AbortSignal): Promise<JsonObject> {
  try {
    return await cachedRoblox(`user_details:${userId}`, 3600, () => robloxJson(`${ROBLOX_USERS}/users/${userId}`, { signal }), signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Profile details unavailable", error);
    return {};
  }
}

async function fetchUsernameHistory(userId: string, signal?: AbortSignal): Promise<string[]> {
  try {
    return await cachedRoblox(`username_history:${userId}`, 3600, async () => {
      const payload = await robloxJson(`${ROBLOX_USERS}/users/${userId}/username-history?limit=50&sortOrder=Desc`, { signal });
      return (payload.data ?? []).map((item: JsonObject) => String(item.name ?? "").trim()).filter(Boolean);
    }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Username history unavailable", error);
    return [];
  }
}

async function fetchFriendCounts(userId: string, signal?: AbortSignal): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = { friends: null, following: null, followers: null };
  for (const [key, endpoint] of Object.entries({
    friends: "friends/count",
    following: "followings/count",
    followers: "followers/count",
  })) {
    try {
      const payload = await robloxJson(`${ROBLOX_FRIENDS}/${userId}/${endpoint}`, { signal });
      result[key] = Number(payload.count ?? 0);
    } catch (error) {
      if (signal?.aborted) throw error;
      log(`Unable to fetch ${key} count`, error);
    }
  }
  return result;
}

interface AvatarSignals {
  assetCount: number | null;
  assetTypeCount: number | null;
  wearingCount: number | null;
}

async function fetchAvatarSignals(userId: string, signal?: AbortSignal): Promise<AvatarSignals> {
  try {
    return await cachedRoblox(`avatar_signals:${userId}`, 1800, async () => {
      const result: AvatarSignals = { assetCount: null, assetTypeCount: null, wearingCount: null };
      const [avatar, wearing] = await Promise.allSettled([
        robloxJson(`${ROBLOX_AVATAR}/${userId}/avatar`, { signal }),
        robloxJson(`${ROBLOX_AVATAR}/${userId}/currently-wearing`, { signal }),
      ]);
      if (avatar.status === "fulfilled") {
        const assets = Array.isArray(avatar.value.assets) ? avatar.value.assets as JsonObject[] : [];
        result.assetCount = assets.length;
        result.assetTypeCount = new Set(
          assets.map((asset) => Number(asset.assetType?.id ?? 0)).filter(Boolean),
        ).size;
      } else if (signal?.aborted) {
        throw avatar.reason;
      } else {
        log("Avatar assets unavailable", avatar.reason);
      }
      if (wearing.status === "fulfilled") {
        result.wearingCount = Array.isArray(wearing.value.assetIds) ? wearing.value.assetIds.length : 0;
      } else if (signal?.aborted) {
        throw wearing.reason;
      } else {
        log("Currently-wearing assets unavailable", wearing.reason);
      }
      return result;
    }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Avatar signals unavailable", error);
    return { assetCount: null, assetTypeCount: null, wearingCount: null };
  }
}

interface GameSignals {
  created: number | null;
  favorites: number | null;
}

async function fetchGameSignals(userId: string, signal?: AbortSignal): Promise<GameSignals> {
  try {
    return await cachedRoblox(`game_signals:${userId}`, 1800, async () => {
      const result: GameSignals = { created: null, favorites: null };
      const [created, favorites] = await Promise.allSettled([
        robloxJson(`${ROBLOX_GAMES}/${userId}/games?accessFilter=2&limit=50&sortOrder=Desc`, { signal }),
        robloxJson(`${ROBLOX_GAMES}/${userId}/favorite/games?limit=50`, { signal }),
      ]);
      if (created.status === "fulfilled") {
        result.created = Array.isArray(created.value.data) ? created.value.data.length : 0;
      } else if (signal?.aborted) {
        throw created.reason;
      } else {
        log("Created games unavailable", created.reason);
      }
      if (favorites.status === "fulfilled") {
        result.favorites = Array.isArray(favorites.value.data) ? favorites.value.data.length : 0;
      } else if (signal?.aborted) {
        throw favorites.reason;
      } else {
        log("Favorite games unavailable", favorites.reason);
      }
      return result;
    }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Game signals unavailable", error);
    return { created: null, favorites: null };
  }
}

interface InventorySignals {
  itemCount: number | null;
  itemCapped: boolean;
  assetTypeCount: number | null;
  gamepassCount: number | null;
  gamepassCapped: boolean;
  private: boolean;
}

// One page holds 100 items, so these allow 6,000 inventory items and 2,000 game
// passes before the count is shown as a lower bound.
const INVENTORY_PAGE_LIMIT = 60;
const GAMEPASS_PAGE_LIMIT = 20;

async function fetchInventorySignals(userId: string, signal?: AbortSignal): Promise<InventorySignals> {
  try {
    return await cachedRoblox(`inventory_signals:${userId}`, 900, async () => {
      const result: InventorySignals = { itemCount: null, itemCapped: false, assetTypeCount: null, gamepassCount: null, gamepassCapped: false, private: false };
      const collect = async (filter: string, maxPages: number) => {
        let count = 0;
        const types = new Set<string>();
        let pageToken = "";
        let pages = 0;
        let available = true;
        do {
          const params = new URLSearchParams({ maxPageSize: "100" });
          if (filter) params.set("filter", filter);
          if (pageToken) params.set("pageToken", pageToken);
          const response = await requestJson(`${ROBLOX_CLOUD}/users/${userId}/inventory-items?${params}`, {
            headers: { "x-api-key": robloxApiKey! },
            signal,
          }, true);
          if (response.status === 403) return { count, types: types.size, denied: true, available: false, capped: false };
          if (!response.ok) {
            available = false;
            break;
          }
          const payload = await response.json() as JsonObject;
          for (const item of payload.inventoryItems ?? []) {
            count += 1;
            const details = (item as JsonObject).assetDetails as JsonObject | undefined;
            const type = String(details?.inventoryItemAssetType ?? "");
            if (type) types.add(type);
          }
          pageToken = String(payload.nextPageToken ?? "");
          pages += 1;
        } while (pageToken && pages < maxPages);
        return { count, types: types.size, denied: false, available, capped: Boolean(pageToken) };
      };

      const [inventory, gamepasses] = await Promise.allSettled([
        collect("", INVENTORY_PAGE_LIMIT),
        collect("gamePasses=true", GAMEPASS_PAGE_LIMIT),
      ]);
      if (inventory.status === "fulfilled") {
        if (inventory.value.denied) result.private = true;
        else if (inventory.value.available) {
          result.itemCount = inventory.value.count;
          result.itemCapped = inventory.value.capped;
          result.assetTypeCount = inventory.value.types;
        }
      } else if (signal?.aborted) {
        throw inventory.reason;
      } else {
        log("Inventory items unavailable", inventory.reason);
      }
      if (gamepasses.status === "fulfilled") {
        if (gamepasses.value.denied) result.private = true;
        else if (gamepasses.value.available) {
          result.gamepassCount = gamepasses.value.count;
          result.gamepassCapped = gamepasses.value.capped;
        }
      } else if (signal?.aborted) {
        throw gamepasses.reason;
      } else {
        log("Game passes unavailable", gamepasses.reason);
      }
      return result;
    }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Inventory signals unavailable", error);
    return { itemCount: null, itemCapped: false, assetTypeCount: null, gamepassCount: null, gamepassCapped: false, private: false };
  }
}

function robloxGroupUrl(groupId: number): string {
  return `https://www.roblox.com/groups/${groupId}`;
}

function formatGroups(groups: JsonObject[]): string {
  const names = groups.flatMap((data) => {
    const id = Number(data.group?.id);
    if (!GROUP_IDS.has(id)) return [];
    const name = String(data.group?.name ?? `Group ${id}`);
    const role = String(data.role?.name ?? "Member");
    return [`• [${name}](${robloxGroupUrl(id)}) — ${role}`];
  });
  return names.join("\n") || NONE;
}

export function createGroupsEmbed(username: string, groups: JsonObject[]): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`CBRN Groups — ${username}`)
    .setColor(embedColor("CBRN Groups"))
    .addFields({ name: "Ranks & Division", value: formatGroups(groups).slice(0, 1024) })
    .setFooter({ text: footer() });
}

// /profile is deliberately just the link: no badge counts, groups, or records.
export function createProfileLinkEmbed(username: string, userId: string): EmbedBuilder {
  const url = `https://www.roblox.com/users/${userId}/profile`;
  return new EmbedBuilder()
    .setTitle(username)
    .setURL(url)
    .setDescription(url)
    .setColor(embedColor("Profile"))
    .setFooter({ text: footer() });
}

async function fetchTrelloCards(boardId: string, username: string, signal?: AbortSignal): Promise<JsonObject[]> {
  const cacheKey = `trello:${boardId}:${username.toLowerCase()}`;
  const cached = await getCached<JsonObject[]>(cacheKey, 600);
  if (cached) return cached;
  const params = new URLSearchParams({ cards: "open", card_fields: "name,desc,shortLink,url" });
  try {
    const response = await requestJson(`${TRELLO_API}/boards/${boardId}?${params}`, { signal });
    if (!response.ok) return [];
    const payload = await response.json() as JsonObject;
    const variations = [username.toLowerCase(), username.toLowerCase().replaceAll("_", ""), username.toLowerCase().replaceAll("_", " ")];
    const cards = (payload.cards ?? []).filter((card: JsonObject) => {
      const text = `${card.name ?? ""}\n${card.desc ?? ""}`.toLowerCase();
      return variations.some((variation) => text.includes(variation));
    });
    await setCached(cacheKey, cards);
    return cards;
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Trello lookup failed", error);
    return [];
  }
}

function usernameVariations(username: string): Set<string> {
  const value = username.trim().toLowerCase();
  return new Set([value, value.replaceAll("_", ""), value.replaceAll("_", " ")]);
}

function matchesTrelloRecord(desc: string, username: string, kind: "blacklist" | "secret"): boolean {
  const lines = desc.split(/\r?\n/);
  const targets = usernameVariations(username);
  const targetLabels = kind === "blacklist"
    ? ["username of who's being blacklisted:", "blacklisted:"]
    : ["contact information:", "roblox username:"];
  const starts = lines.flatMap((line, index) => targetLabels.some((label) => line.trim().toLowerCase().startsWith(label)) ? [index] : []);
  if (!starts.length) return true;
  for (let position = 0; position < starts.length; position += 1) {
    const block = lines.slice(starts[position], starts[position + 1] ?? lines.length);
    const normalized = block.map((line) => line.trim().toLowerCase());
    const targetLine = normalized.find((line) => kind === "blacklist"
      ? line.startsWith("username of who's being blacklisted:") || line.startsWith("blacklisted:")
      : line.startsWith("roblox username:"));
    if (!targetLine || !targets.has(targetLine.split(":", 2)[1]?.trim() ?? "")) continue;
    if (kind === "secret" && !normalized.some((line) => line.startsWith("punished for:"))) continue;
    return true;
  }
  return false;
}

function trelloText(cards: JsonObject[], username: string, kind: "blacklist" | "secret"): string {
  const lines = cards.flatMap((card) => {
    const desc = String(card.desc ?? "").trim();
    if (!desc || !matchesTrelloRecord(desc, username, kind)) return [];
    const name = String(card.name ?? "").trim() || "View case";
    const url = String(card.url ?? "").trim() || (card.shortLink ? `https://trello.com/c/${card.shortLink}` : "");
    return [url ? `• [${name}](${url})` : `• ${name}`];
  });
  return lines.join("\n") || NONE;
}

async function fetchXtracker(userId: string, signal?: AbortSignal): Promise<string> {
  if (!xtrackerApiKey) return "Currently unavailable due to server limitations.";
  try {
    const token = xtrackerApiKey.replace(/^Bearer\s+/i, "");
    const headers = { Authorization: token };
    const [registryResponse, ownershipResponse] = await Promise.all([
      requestJson(`${XTRACKER_API}/api/registry/user?id=${encodeURIComponent(userId)}`, { headers, signal }),
      requestJson(`${XTRACKER_API}/api/ownership/user?id=${encodeURIComponent(userId)}`, { headers, signal }),
    ]);
    const blocks: string[] = [];
    let hasFailures = false;
    for (const [name, response] of [["registry", registryResponse], ["ownership", ownershipResponse]] as const) {
      if (response.ok || response.status === 404) continue;
      hasFailures = true;
      log(`[x]Tracker ${name} lookup failed (HTTP ${response.status})`);
    }
    if (ownershipResponse.ok) {
      const owned = (await ownershipResponse.json() as JsonObject).owned_cheat;
      if (Array.isArray(owned) && owned.length) blocks.push(`**Owned cheats**\n${owned.map((item) => `• ${item}`).join("\n")}`);
    }
    if (registryResponse.ok) {
      const record = await registryResponse.json() as JsonObject;
      if (Array.isArray(record.evidence)) {
        for (const [index, item] of record.evidence.entries()) {
          const entry = item as JsonObject;
          blocks.push(`**Entry #${index + 1}**\n**Date:** ${entry.date || "Unknown date"}\n**Reason:** ${entry.reason || item || "Unknown reason"}${entry.url ? `\n**Evidence:** ${entry.url}` : ""}`);
        }
      }
    }
    if (hasFailures) blocks.push("Currently unavailable due to server limitations.");
    return blocks.join("\n\n") || NONE;
  } catch (error) {
    if (signal?.aborted) throw error;
    log("[x]Tracker lookup failed", error);
    return "Currently unavailable due to server limitations.";
  }
}

interface WatcherAccount {
  id: string;
  sources: string[];
  flagged: boolean;
  /** Total activity score across this account's flagged servers. */
  score?: number;
  /** How many flagged servers the account was seen in. */
  serverCount?: number;
  /** Server evidence from the watcher's Discord lookup, filled in for flagged accounts. */
  reasons?: string[];
}

interface WatcherResult {
  accounts: WatcherAccount[];
  status: string;
}

type WatcherProduct = "robloxwatcher" | "exploitwatcher";

interface WatcherAccountGroup {
  watcher: string;
  product: WatcherProduct;
  accounts: WatcherAccount[];
}

export const WATCHER_LINKED_ACCOUNT_LIMIT = 8;
const WATCHER_ROLE_LIMIT = 6;

function watcherAccounts(payload: JsonObject): WatcherAccount[] {
  const accounts = Array.isArray(payload.discordAccounts) ? payload.discordAccounts as JsonObject[] : [];
  return accounts.map((account) => ({
    id: String(account.id ?? "Unknown"),
    sources: Array.isArray(account.sources) ? account.sources.map(String) : [],
    flagged: account.flagged === true,
  }));
}

function watcherDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function watcherDateRange(first: Date, last: Date): string {
  return first.toDateString() === last.toDateString()
    ? discordTimestamp(first, "d")
    : `${discordTimestamp(first, "d")} – ${discordTimestamp(last, "d")}`;
}

function watcherActivityStats(activity: JsonObject): string[] {
  const count = (value: unknown): number => Number(value ?? 0);
  const stats: string[] = [];
  const add = (value: number, singular: string, plural = `${singular}s`) => {
    if (value > 0) stats.push(`${value.toLocaleString("en-US")} ${value === 1 ? singular : plural}`);
  };
  add(count(activity.messages), "message");
  add(count(activity.slashCommands), "slash command");
  add(count(activity.reactions), "reaction");
  add(count(activity.vcJoins), "voice join");
  add(count(activity.boosts), "boost");
  add(count(activity.scriptRequests), "script request");
  add(count(activity.bypassBotUsages), "bypass use");
  add(count(activity.rr34Requests), "RR34 request");
  add(count(activity.nsfwRequests), "NSFW request");
  add(count(activity.erpInteractions), "ERP interaction");
  return stats;
}

// One line per flagged server with everything the Discord lookup reports:
// why the server is flagged, the user's standing and roles, when they were
// there, and what they did. No server or activity field is dropped.
function watcherGuildEvidence(guild: JsonObject): string {
  const name = String(guild.name ?? "Unknown Server");
  const types = Array.isArray(guild.guildTypes)
    ? (guild.guildTypes as JsonObject[]).map((type) => String(type.name ?? "")).filter(Boolean)
    : [];
  const flags = Array.isArray(guild.guildFlags) ? guild.guildFlags.map(String).filter(Boolean) : [];
  const roles = Array.isArray(guild.roles)
    ? (guild.roles as JsonObject[]).map((role) => String(role.name ?? "").trim()).filter(Boolean)
    : [];
  const membership = (guild.membership ?? {}) as JsonObject;
  const standing = membership.owner === true ? "owner" : membership.staff === true ? "staff" : "";
  const joins = (Array.isArray(guild.guildJoins) ? guild.guildJoins : []).map(watcherDate).filter((date): date is Date => Boolean(date));
  const leaves = (Array.isArray(guild.guildLeaves) ? guild.guildLeaves : []).map(watcherDate).filter((date): date is Date => Boolean(date));
  const starts = [watcherDate(guild.estimatedJoin), watcherDate(guild.firstSeen), ...joins].filter((date): date is Date => Boolean(date));
  const ends = [watcherDate(guild.lastSeen), watcherDate(guild.lastActivity), ...leaves].filter((date): date is Date => Boolean(date));
  const start = starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : undefined;
  const end = ends.length ? new Date(Math.max(...ends.map((date) => date.getTime()))) : undefined;
  const stats = watcherActivityStats((guild.activity ?? {}) as JsonObject);
  const roleText = roles.slice(0, WATCHER_ROLE_LIMIT).join(", ") + (roles.length > WATCHER_ROLE_LIMIT ? ` +${roles.length - WATCHER_ROLE_LIMIT}` : "");
  const details = [
    standing,
    flags.length ? `flags: ${flags.join(", ")}` : "",
    roles.length ? `roles: ${roleText}` : "",
    start && end ? watcherDateRange(start, end) : start ? `since ${discordTimestamp(start, "d")}` : end ? `last seen ${discordTimestamp(end, "R")}` : "",
    stats.join(", "),
  ].filter(Boolean);
  return `**${name}**${types.length ? ` (${types.join(", ")})` : ""}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

// Server evidence belongs with the watcher section it came from: the mention
// names the account and the indented lines give every server behind the flag.
export function formatWatcherEvidence(accounts: WatcherAccount[]): string {
  return accounts.flatMap((account) => {
    if (!account.flagged) return [];
    const label = isDiscordUserId(account.id) ? `<@${account.id}>` : `\`${account.id}\``;
    const meta = [
      account.sources.length ? `linked via ${account.sources.join(", ")}` : "",
      account.serverCount ? `${account.serverCount.toLocaleString("en-US")} server${account.serverCount === 1 ? "" : "s"}` : "",
      account.score !== undefined ? `score ${account.score.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "",
    ].filter(Boolean);
    const reasons = account.reasons ?? [];
    return [
      `↳ ${label}${meta.length ? ` · ${meta.join(" · ")}` : ""}`,
      ...(reasons.length ? reasons.map((text) => `  • ${text}`) : ["  None"]),
    ];
  }).join("\n");
}

// The Discord lookup is what explains a flag: every flagged server the account
// was seen in, why each server is flagged, and the activity behind it.
export function watcherGuildReasons(payload: JsonObject): string[] {
  const guilds = Array.isArray(payload.guilds) ? payload.guilds as JsonObject[] : [];
  if (!guilds.length) return payload.flagged === true ? ["flagged account; no server details were reported"] : [];
  return guilds.map(watcherGuildEvidence);
}

interface DiscordWatcherRecord {
  flagged: boolean;
  score?: number;
  serverCount: number;
  reasons: string[];
}

async function fetchDiscordWatcherRecord(product: WatcherProduct, discordId: string, signal?: AbortSignal): Promise<DiscordWatcherRecord> {
  const api = product === "robloxwatcher" ? ROBLOX_WATCHER_API : EXPLOIT_WATCHER_API;
  const key = product === "robloxwatcher" ? robloxWatcherApiKey : exploitWatcherApiKey;
  if (!key) return { flagged: false, serverCount: 0, reasons: [] };
  try {
    const payload = await cachedRoblox(`${product}:discord:${discordId}`, 1800, async () => {
      const response = await requestJson(`${api}/search/${encodeURIComponent(discordId)}`, {
        headers: { Authorization: `Bearer ${key.replace(/^Bearer\s+/i, "")}`, Accept: "application/json" },
        signal,
      });
      if (response.status === 404) return {} as JsonObject;
      if (!response.ok) throw new BotError(`${product === "robloxwatcher" ? "Roblox Watcher" : "Exploit Watcher"} could not complete the Discord lookup (HTTP ${response.status}).`);
      return await response.json() as JsonObject;
    }, signal);
    const reasons = watcherGuildReasons(payload);
    const score = Number(payload.totalScore);
    return {
      flagged: payload.flagged === true || reasons.length > 0,
      score: Number.isFinite(score) ? score : undefined,
      serverCount: Array.isArray(payload.guilds) ? payload.guilds.length : 0,
      reasons,
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Watcher Discord detail lookup failed", error);
    return { flagged: false, serverCount: 0, reasons: [] };
  }
}

export interface DiscordAccountView {
  username: string;
  displayName: string;
  createdAt: Date;
}

export function formatDiscordAccountSection(discordId: string | undefined, account: DiscordAccountView | undefined): string {
  const created = account?.createdAt;
  return [
    "## Discord Account",
    ...(discordId ? [`<@${discordId}>`] : []),
    `**Username:** ${account?.username ?? "Unknown"}`,
    `**Display Name:** ${account?.displayName ?? "Unknown"}`,
    `**User ID:** \`${discordId ?? "Unknown"}\``,
    `**Account Created:** ${created ? `${discordTimestamp(created, "D")} (${discordTimestamp(created, "R")})` : "Unknown"}`,
  ].join("\n");
}

async function attachWatcherReasons(groups: WatcherAccountGroup[], signal?: AbortSignal): Promise<void> {
  await Promise.all(groups.map(async (group) => {
    await Promise.all(group.accounts.filter((account) => account.flagged).map(async (account) => {
      const record = await fetchDiscordWatcherRecord(group.product, account.id, signal);
      if (record.reasons.length) account.reasons = record.reasons;
      if (record.serverCount) {
        account.serverCount = record.serverCount;
        account.score = record.score;
      }
    }));
  }));
}

// Roblox Watcher only reports linked accounts, and those move into the shared
// header block, so its own section appears only when the lookup has no data.
async function fetchRobloxWatcher(userId: string, signal?: AbortSignal): Promise<WatcherResult> {
  if (!robloxWatcherApiKey) {
    return { accounts: [], status: "Not configured. Add `ROBLOX_WATCHER_API_KEY` to enable this check." };
  }
  try {
    const payload = await cachedRoblox(`roblox_watcher:${userId}`, 1800, async () => {
      const token = robloxWatcherApiKey.replace(/^Bearer\s+/i, "");
      const response = await requestJson(`${ROBLOX_WATCHER_API}/roblox/search/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new BotError("The Roblox Watcher API key was rejected.");
      }
      if (response.status === 404) return { discordAccounts: [] } as JsonObject;
      if (!response.ok) throw new BotError(`Roblox Watcher could not complete the request (HTTP ${response.status}).`);
      return await response.json() as JsonObject;
    }, signal);
    const accounts = watcherAccounts(payload);
    if (!accounts.length) return { accounts, status: "No linked Discord accounts were found in the Roblox Watcher (NSFW/condo server) database." };
    return { accounts, status: "" };
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Roblox Watcher lookup failed", error);
    return { accounts: [], status: errorText(error, "Roblox Watcher could not be reached right now.") };
  }
}

// A linked Discord account can be flagged even when the Roblox account itself
// has no injections of its own, so either signal marks the lookup as flagged.
export function formatExploitWatcher(payload: JsonObject): string {
  const accounts = watcherAccounts(payload);
  const games = Array.isArray(payload.injectedGames) ? payload.injectedGames as JsonObject[] : [];
  const flaggedAccounts = accounts.filter((account) => account.flagged).length;
  const injections = Number(payload.totalInjections ?? 0);
  const gameCount = Number(payload.totalGamesInjected ?? games.length);
  const flagged = payload.flagged === true || flaggedAccounts > 0 || injections > 0;
  const heading = !flagged
    ? "🟢 **Not flagged** — no injections or flagged linked accounts were found"
    : injections > 0
      ? `🔴 **Flagged** — ${injections.toLocaleString("en-US")} injection${injections === 1 ? "" : "s"} in ${gameCount.toLocaleString("en-US")} game${gameCount === 1 ? "" : "s"}`
      : flaggedAccounts > 0
        ? `🔴 **Flagged** — ${flaggedAccounts} linked Discord account${flaggedAccounts === 1 ? "" : "s"} flagged`
        : "🔴 **Flagged** — this account appears in the injection logs";
  const blocks = [heading];
  if (games.length) {
    const lines = games.map((game) => {
      const count = Number(game.totalInjections ?? 0);
      const first = watcherDate(game.firstInjection);
      const last = watcherDate(game.lastInjection);
      const when = first && last
        ? ` (${watcherDateRange(first, last)})`
        : last ? ` (last ${discordTimestamp(last, "d")})` : "";
      return `• ${String(game.name ?? "Unknown")} — ${count.toLocaleString("en-US")}${when}`;
    });
    blocks.push(`**Games injected:**\n${lines.join("\n")}`);
  }
  return blocks.join("\n");
}

async function fetchExploitWatcher(userId: string, signal?: AbortSignal): Promise<WatcherResult> {
  if (!exploitWatcherApiKey) {
    return { accounts: [], status: "Not configured. Add `EXPLOIT_WATCHER_API_KEY` to enable this check." };
  }
  try {
    const payload = await cachedRoblox(`exploit_watcher:${userId}`, 1800, async () => {
      const token = exploitWatcherApiKey.replace(/^Bearer\s+/i, "");
      const response = await requestJson(`${EXPLOIT_WATCHER_API}/roblox/search/${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        throw new BotError("The Exploit Watcher API key was rejected.");
      }
      if (response.status === 404) return { discordAccounts: [], flagged: false } as JsonObject;
      if (!response.ok) throw new BotError(`Exploit Watcher could not complete the request (HTTP ${response.status}).`);
      return await response.json() as JsonObject;
    }, signal);
    return { accounts: watcherAccounts(payload), status: formatExploitWatcher(payload) };
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Exploit Watcher lookup failed", error);
    return { accounts: [], status: errorText(error, "Exploit Watcher could not be reached right now.") };
  }
}

async function fetchBadges(userId: string, signal?: AbortSignal): Promise<JsonObject[]> {
  const all: JsonObject[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ filter: "badges=true", maxPageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await requestJson(`${ROBLOX_CLOUD}/users/${userId}/inventory-items?${params}`, {
      headers: { "x-api-key": robloxApiKey! },
      signal,
    }, true);
    if (response.status === 401) throw new BotError("The Roblox API key was rejected. Check that the key is active, has not expired, and allows this machine's IP address.");
    if (response.status === 403) throw new PrivateInventoryError("This Roblox user's badge inventory is private or unavailable to the API key.");
    if (!response.ok) throw new BotError("Roblox could not load this user's badge history. Please try again later.");
    const payload = await response.json() as JsonObject;
    all.push(...(payload.inventoryItems ?? []));
    pageToken = String(payload.nextPageToken ?? "");
  } while (pageToken);
  return all;
}

function formatRiskBand(score: number): string {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  if (score >= 15) return "Low";
  return "Minimal";
}

export interface DiscordAltRisk {
  score: number;
  band: string;
  ageDays: number;
}

// Discord exposes no Roblox history, so account age is the only reliable
// signal available to the bot for a Discord-side alt-risk estimate.
export function discordAltRisk(createdAt: Date | undefined, now = Date.now()): DiscordAltRisk | undefined {
  if (!createdAt || Number.isNaN(createdAt.getTime())) return undefined;
  const ageDays = Math.max(0, Math.floor((now - createdAt.getTime()) / 86_400_000));
  const score = ageDays < 3 ? 85
    : ageDays < 14 ? 70
      : ageDays < 30 ? 55
        : ageDays < 90 ? 40
          : ageDays < 180 ? 30
            : ageDays < 365 ? 20
              : ageDays < 730 ? 12
                : 5;
  return { score, band: formatRiskBand(score), ageDays };
}

// Combine two independent risk estimates without letting a low score hide a
// high one: 1 - (1 - roblox)(1 - discord).
export function combinedAltRisk(robloxScore: number, discordScore: number | undefined): number {
  if (discordScore === undefined) return Math.round(robloxScore);
  const combined = 100 - ((100 - robloxScore) * (100 - discordScore)) / 100;
  return Math.round(Math.min(100, Math.max(0, combined)));
}

const ALT_AI_MAX_DEVIATION = 30;

export function blendAltRisk(ruleRisk: number, aiChance: number | undefined): { score: number; usedAi: boolean } {
  if (aiChance === undefined) return { score: ruleRisk, usedAi: false };
  if (Math.abs(aiChance - ruleRisk) > ALT_AI_MAX_DEVIATION) return { score: ruleRisk, usedAi: false };
  return { score: Math.round((ruleRisk + aiChance) / 2), usedAi: true };
}

interface AltRiskData {
  created: Date | undefined;
  badgeCount: number | undefined;
  friends: Record<string, number | null>;
  usernameChanges: number;
  hasBlacklist: boolean;
  hasSecret: boolean;
  hasExternalRecords: boolean;
  groupCount: number | undefined;
  divisionRankCount: number | undefined;
  avatarAssetCount: number | null;
  avatarAssetTypeCount: number | null;
  wearingCount: number | null;
  createdGames: number | null;
  favoriteGames: number | null;
  inventoryItemCount: number | null;
  inventoryAssetTypeCount: number | null;
  gamepassCount: number | null;
  inventoryPrivate: boolean;
}

function riskPoints(value: number | null | undefined, thresholds: ReadonlyArray<readonly [number, number]>): number | undefined {
  if (value === null || value === undefined) return undefined;
  const match = thresholds.find(([max]) => value < max);
  return match ? match[1] : 0;
}

export function altRisk(data: AltRiskData): [number, string] {
  let earned = 0;
  let possible = 0;
  const add = (weight: number, points: number) => {
    possible += weight;
    earned += Math.max(0, Math.min(weight, points));
  };
  const addThreshold = (weight: number, value: number | null | undefined, thresholds: ReadonlyArray<readonly [number, number]>) => {
    const points = riskPoints(value, thresholds);
    if (points !== undefined) add(weight, points);
  };

  if (data.created) {
    const days = Math.max(0, (Date.now() - data.created.getTime()) / 86_400_000);
    add(22, days < 7 ? 22 : days < 30 ? 18 : days < 90 ? 13 : days < 365 ? 7 : 0);
  }
  addThreshold(14, data.badgeCount, [[5, 14], [25, 10], [100, 6], [500, 3]]);
  addThreshold(9, data.friends["friends"], [[3, 9], [10, 6], [30, 3]]);
  addThreshold(6, data.friends["followers"], [[3, 6], [10, 4], [30, 2]]);
  addThreshold(4, data.friends["following"], [[3, 4], [10, 3], [30, 1]]);
  add(6, data.usernameChanges >= 5 ? 6 : data.usernameChanges >= 2 ? 4 : data.usernameChanges === 1 ? 2 : 0);
  add(10, data.hasBlacklist ? 10 : 0);
  add(6, data.hasSecret ? 6 : 0);
  add(6, data.hasExternalRecords ? 6 : 0);
  addThreshold(6, data.groupCount, [[1, 6], [3, 4], [6, 2]]);
  addThreshold(4, data.divisionRankCount, [[1, 4], [2, 2]]);
  addThreshold(5, data.avatarAssetCount, [[1, 5], [5, 3], [15, 1]]);
  addThreshold(4, data.avatarAssetTypeCount, [[1, 4], [3, 2]]);
  addThreshold(3, data.wearingCount, [[1, 3], [3, 1]]);
  addThreshold(7, data.inventoryItemCount, [[1, 7], [10, 5], [50, 3], [200, 1]]);
  addThreshold(4, data.inventoryAssetTypeCount, [[1, 4], [3, 2], [8, 1]]);
  addThreshold(5, data.gamepassCount, [[1, 5], [2, 3], [5, 1]]);
  addThreshold(5, data.createdGames, [[1, 5], [2, 3], [5, 1]]);
  addThreshold(3, data.favoriteGames, [[1, 3], [3, 1]]);
  add(4, data.inventoryPrivate ? 4 : 0);

  let score = possible ? Math.round(100 * earned / possible) : 0;
  // Serious records must never be diluted into "Minimal" by the other signals.
  if (data.hasBlacklist) score = Math.max(score, 65);
  else if (data.hasSecret) score = Math.max(score, 55);
  else if (data.hasExternalRecords) score = Math.max(score, 45);
  return [score, formatRiskBand(score)];
}

function joinDate(details: JsonObject): string {
  const created = String(details.created ?? "");
  if (!created) return NONE;
  const date = new Date(created);
  return Number.isNaN(date.getTime()) ? created.slice(0, 10) : date.toISOString().slice(0, 10);
}

function detailsCreated(details: JsonObject): Date | undefined {
  const date = new Date(String(details.created ?? ""));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

interface DivisionHistoryTab {
  division: string;
  code: string;
  tab: string;
}

export interface DivisionHistoryRecord {
  userId: string;
  division: string;
  action: "join" | "leave";
  at: number;
}

export interface DivisionStint {
  division: string;
  joined?: Date;
  left?: Date;
  ongoing: boolean;
}

const DIVISION_MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = csv.startsWith("\uFEFF") ? csv.slice(1) : csv;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === "\"") {
        if (input[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === "\"") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function divisionEpoch(year: number, month: number, day: number, hour: number, minute: number, second: number): number | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return undefined;
  const local = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(local);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
  // The log labels its times as EST; convert them to UTC for Discord timestamps.
  return local + 5 * 60 * 60 * 1000;
}

function hour24(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  if (hour === 12) return meridiem === "AM" ? 0 : 12;
  return meridiem === "PM" ? hour + 12 : hour;
}

export function parseDivisionTimestamp(value: string): number | undefined {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return undefined;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) return divisionEpoch(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (match) return divisionEpoch(Number(match[3]), Number(match[1]), Number(match[2]), hour24(Number(match[4]), match[7]?.toUpperCase()), Number(match[5]), Number(match[6] ?? 0));
  match = text.match(/^(?:[A-Za-z]+,?\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (match) {
    const month = DIVISION_MONTHS[match[1].toLowerCase()];
    if (month) return divisionEpoch(Number(match[3]), month, Number(match[2]), hour24(Number(match[4]), match[7]?.toUpperCase()), Number(match[5]), Number(match[6] ?? 0));
  }
  match = text.match(/^(?:[A-Za-z]+,?\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (match) {
    const month = DIVISION_MONTHS[match[2].toLowerCase()];
    if (month) return divisionEpoch(Number(match[3]), month, Number(match[1]), hour24(Number(match[4]), match[7]?.toUpperCase()), Number(match[5]), Number(match[6] ?? 0));
  }
  return undefined;
}

function normalizeSheetUserId(value: string): string {
  return value.trim().replace(/^'/, "").replace(/\.0+$/, "");
}

export function parseDivisionHistoryCsv(csv: string, division: string, code: string, userId?: string): DivisionHistoryRecord[] {
  const rows = parseCsvRows(csv);
  if (!rows.some((row) => String(row[7] ?? "").trim().toLowerCase() === "joined/left")) {
    throw new Error("Unexpected division history sheet format.");
  }
  const wantedCode = code.toLowerCase();
  const records: DivisionHistoryRecord[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rowUserId = normalizeSheetUserId(String(row[2] ?? ""));
    if (!rowUserId || (userId && rowUserId !== userId)) continue;
    const label = String(row[7] ?? "").trim();
    const match = label.match(/^(joined|left)\s+(.+)$/i);
    if (!match || match[2].trim().toLowerCase() !== wantedCode) continue;
    const at = parseDivisionTimestamp(String(row[6] ?? ""));
    if (at === undefined) continue;
    const action = match[1].toLowerCase() === "joined" ? "join" : "leave";
    const key = `${rowUserId}:${action}:${at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ userId: rowUserId, division, action, at });
  }
  return records.sort((left, right) => left.at - right.at);
}

export function buildDivisionStints(records: DivisionHistoryRecord[]): DivisionStint[] {
  const byDivision = new Map<string, DivisionHistoryRecord[]>();
  for (const record of records) {
    const existing = byDivision.get(record.division);
    if (existing) existing.push(record);
    else byDivision.set(record.division, [record]);
  }
  const stints: DivisionStint[] = [];
  for (const [division, divisionRecords] of byDivision) {
    divisionRecords.sort((left, right) => left.at - right.at);
    let joined: Date | undefined;
    for (const record of divisionRecords) {
      if (record.action === "join") {
        // A second join without a leave means the previous stint's end is unknown.
        if (joined) stints.push({ division, joined, ongoing: false });
        joined = new Date(record.at);
      } else if (joined) {
        stints.push({ division, joined, left: new Date(record.at), ongoing: false });
        joined = undefined;
      } else {
        stints.push({ division, left: new Date(record.at), ongoing: false });
      }
    }
    if (joined) stints.push({ division, joined, ongoing: true });
  }
  return stints;
}

function formatDivisionDuration(start: Date, end: Date | undefined, now: number): string {
  const days = Math.max(0, Math.floor(((end?.getTime() ?? now) - start.getTime()) / 86_400_000));
  if (days < 1) return "less than a day";
  return `${days.toLocaleString("en-US")} ${days === 1 ? "day" : "days"}`;
}

export function formatDivisionHistory(stints: DivisionStint[], now = Date.now()): string {
  if (!stints.length) return NONE;
  const latest = (stint: DivisionStint): number => Math.max(stint.joined?.getTime() ?? 0, stint.left?.getTime() ?? 0);
  const divisions = [...new Set(stints.map((stint) => stint.division))].sort((left, right) => {
    const leftLatest = Math.max(...stints.filter((stint) => stint.division === left).map(latest));
    const rightLatest = Math.max(...stints.filter((stint) => stint.division === right).map(latest));
    return rightLatest - leftLatest;
  });
  return divisions.flatMap((division) => stints
    .filter((stint) => stint.division === division)
    .sort((left, right) => (left.joined?.getTime() ?? left.left?.getTime() ?? 0) - (right.joined?.getTime() ?? right.left?.getTime() ?? 0))
    .map((stint) => {
      const joined = stint.joined ? `Joined ${discordTimestamp(stint.joined, "D")}` : "Join date unknown";
      const left = stint.left
        ? `left ${discordTimestamp(stint.left, "D")}`
        : stint.ongoing ? "present" : "leave date unknown";
      const duration = stint.joined && (stint.left || stint.ongoing)
        ? `${formatDivisionDuration(stint.joined, stint.left, now)}${stint.ongoing ? " so far" : ""}`
        : "duration unknown";
      return `**${division}** — ${joined}, ${left} (${duration})`;
    })).join("\n");
}

async function fetchDivisionHistory(userId: string, signal?: AbortSignal): Promise<{ stints: DivisionStint[]; unavailable: boolean }> {
  try {
    const index = await cachedRoblox<Record<string, DivisionHistoryRecord[]>>(
      "division_history_index",
      DIVISION_HISTORY_CACHE_SECONDS,
      async () => {
        const records = await Promise.all(DIVISION_HISTORY_TABS.map(async (entry: DivisionHistoryTab) => {
          const url = `https://docs.google.com/spreadsheets/d/${DIVISION_HISTORY_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(entry.tab)}`;
          const response = await requestJson(url, { headers: { Accept: "text/csv" }, signal });
          if (!response.ok) throw new BotError(`Division history could not be loaded (HTTP ${response.status}).`);
          return parseDivisionHistoryCsv(await response.text(), entry.division, entry.code);
        }));
        const index: Record<string, DivisionHistoryRecord[]> = {};
        for (const record of records.flat()) {
          (index[record.userId] ??= []).push(record);
        }
        return index;
      },
      signal,
    );
    return { stints: buildDivisionStints(index[userId] ?? []), unavailable: false };
  } catch (error) {
    if (signal?.aborted) throw error;
    log("Division history lookup failed", error);
    return { stints: [], unavailable: true };
  }
}

async function backgroundCheck(
  username: string,
  signal: AbortSignal = new AbortController().signal,
  resolvedUser?: { id: string; name: string },
  discordId?: string,
): Promise<{ embeds: EmbedBuilder[]; image?: AttachmentBuilder; mentions: string[]; user: { id: string; name: string } }> {
  const user = resolvedUser ?? await resolveUser(username, signal);
  const [groups, details, history, friends, divisionHistory, blacklistCards, secretCards, xtracker, robloxWatcher, exploitWatcher, avatarSignals, gameSignals, inventorySignals, avatar, discordUser] = await Promise.all([
    fetchGroups(user.id, signal), fetchProfileDetails(user.id, signal), fetchUsernameHistory(user.id, signal), fetchFriendCounts(user.id, signal),
    fetchDivisionHistory(user.id, signal),
    fetchTrelloCards(BLACKLIST_BOARD, user.name, signal), fetchTrelloCards(SECRET_SERVICE_BOARD, user.name, signal), fetchXtracker(user.id, signal),
    fetchRobloxWatcher(user.id, signal),
    fetchExploitWatcher(user.id, signal),
    fetchAvatarSignals(user.id, signal), fetchGameSignals(user.id, signal), fetchInventorySignals(user.id, signal),
    fetchRobloxAvatar(user.id, signal).catch((error) => {
      if (signal.aborted) throw error;
      log("Roblox avatar unavailable", error);
      return undefined;
    }),
    discordId ? client.users.fetch(discordId).catch((error) => {
      log("Discord user lookup failed", error);
      return undefined;
    }) : Promise.resolve(undefined),
  ]);
  const linkedGroups: WatcherAccountGroup[] = [
    { watcher: "Roblox Watcher", product: "robloxwatcher", accounts: robloxWatcher.accounts },
    { watcher: "Exploit Watcher", product: "exploitwatcher", accounts: exploitWatcher.accounts },
  ];
  await attachWatcherReasons(linkedGroups, signal);
  const robloxWatcherEvidence = formatWatcherEvidence(robloxWatcher.accounts);
  const exploitWatcherEvidence = formatWatcherEvidence(exploitWatcher.accounts);
  const robloxWatcherField = [robloxWatcher.status, robloxWatcherEvidence].filter(Boolean).join("\n");
  const exploitWatcherField = [exploitWatcher.status, exploitWatcherEvidence].filter(Boolean).join("\n");
  const mentions = [...new Set(linkedGroups.flatMap((group) => group.accounts.map((account) => account.id)))]
    .filter(isDiscordUserId)
    .slice(0, WATCHER_LINKED_ACCOUNT_LIMIT);
  const blacklist = trelloText(blacklistCards, user.name, "blacklist");
  const secret = trelloText(secretCards, user.name, "secret");
  if (signal.aborted) throw signal.reason;
  let badges: JsonObject[] = [];
  let image: Buffer | undefined;
  let inventoryPrivate = false;
  let badgeDataAvailable = false;
  let badgeChartError: string | undefined;
  try {
    const response = await requestJson(`${ROBLOX_CLOUD}/users/${user.id}/inventory-items?filter=badges%3Dtrue&maxPageSize=1`, { headers: { "x-api-key": robloxApiKey! }, signal }, true);
    if (response.status === 401) throw new BotError("The Roblox API key was rejected. Check that the key is active, has not expired, and allows this machine's IP address.");
    if (response.status === 403) throw new PrivateInventoryError("Private inventory.");
    if (!response.ok) throw new BotError("Roblox could not check this user's badge inventory.");
    badges = await fetchBadges(user.id, signal);
    badgeDataAvailable = true;
    const chartColor = CHART_COLORS[getSetting("chart_color", DEFAULT_CHART_COLOR)]?.[0] ?? CHART_COLORS[DEFAULT_CHART_COLOR]![0];
    if (signal.aborted) throw signal.reason;
    image = await makeBadgeChart(user.name, badges, chartColor, avatar?.png, user.id);
    if (signal.aborted) throw signal.reason;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof PrivateInventoryError) inventoryPrivate = true;
    else {
      badgeChartError = errorText(error, "The badge chart could not be generated.");
      log("Badge chart is unavailable", error);
    }
  }
  const created = detailsCreated(details);
  const divisionRanks = groups.flatMap((data) => GROUP_IDS.has(Number(data.group?.id))
    ? [`${data.group?.name ?? ""} — ${data.role?.name ?? "Member"}`]
    : []);
  const [ruleRisk] = altRisk({
    created,
    badgeCount: badgeDataAvailable ? badges.length : undefined,
    friends,
    usernameChanges: history.length,
    hasBlacklist: blacklist !== NONE,
    hasSecret: secret !== NONE,
    hasExternalRecords: xtracker !== NONE,
    groupCount: groups.length,
    divisionRankCount: divisionRanks.length,
    avatarAssetCount: avatarSignals.assetCount,
    avatarAssetTypeCount: avatarSignals.assetTypeCount,
    wearingCount: avatarSignals.wearingCount,
    createdGames: gameSignals.created,
    favoriteGames: gameSignals.favorites,
    inventoryItemCount: inventorySignals.itemCount,
    inventoryAssetTypeCount: inventorySignals.assetTypeCount,
    gamepassCount: inventorySignals.gamepassCount,
    inventoryPrivate: inventoryPrivate || inventorySignals.private,
  });
  let aiAssessment: { chance: number; reason: string } | undefined;
  try {
    if (Date.now() >= altAiRetryAt) {
    aiAssessment = await assessAltRisk({
      baseUrl: altAiBaseUrl,
      model: altAiModel,
      signal,
      signals: {
        baseline_score: ruleRisk,
        account_age_days: created ? Math.max(0, Math.round((Date.now() - created.getTime()) / 86_400_000)) : null,
        badge_count: badgeDataAvailable ? badges.length : null,
        friends: friends.friends,
        following: friends.following,
        followers: friends.followers,
        username_changes: history.length,
        group_count: groups.length,
        division_ranks: divisionRanks.slice(0, 10),
        blacklist_record: blacklist !== NONE,
        secret_service_record: secret !== NONE,
        external_records: xtracker !== NONE,
        avatar_assets: avatarSignals.assetCount,
        avatar_asset_types: avatarSignals.assetTypeCount,
        currently_wearing: avatarSignals.wearingCount,
        inventory_items: inventorySignals.itemCount,
        inventory_asset_types: inventorySignals.assetTypeCount,
        gamepasses: inventorySignals.gamepassCount,
        created_games: gameSignals.created,
        favorite_games: gameSignals.favorites,
        inventory_private: inventoryPrivate || inventorySignals.private,
      },
    });
    }
  } catch (error) {
    if (signal.aborted) throw error;
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    if (cause === "ECONNREFUSED" || cause === "ECONNRESET" || cause === "ETIMEDOUT") {
      altAiRetryAt = Date.now() + ALT_AI_RETRY_MS;
      log("Local alt-risk AI is not running; using the rule-based score. Retrying in 5 minutes.");
    } else {
      log("Local alt-risk AI assessment unavailable; using the rule-based score only.", error);
    }
  }
  const risk = blendAltRisk(ruleRisk, aiAssessment?.chance);
  if (aiAssessment && !risk.usedAi) {
    log(`Ignored local alt-risk AI estimate of ${aiAssessment.chance}% because it deviated from the rule-based ${ruleRisk}% by more than ${ALT_AI_MAX_DEVIATION} points.`);
  }
  const aiNote = risk.usedAi ? aiAssessment?.reason ?? "" : "";
  const band = formatRiskBand(risk.score);
  const stat = (value: number | null | undefined): string =>
    value === null || value === undefined ? "N/A" : value.toLocaleString("en-US");
  const inventoryStat = (value: number | null | undefined, capped = false): string =>
    inventorySignals.private ? "Private" : value === null || value === undefined ? "N/A" : `${value.toLocaleString("en-US")}${capped ? "+" : ""}`;
  const badgeCountLabel = badgeDataAvailable ? stat(badges.length) : inventoryPrivate ? "Private" : "N/A";
  const recordPart = (label: string, text: string): string =>
    `**${label}:**\n${text.length > 280 ? `${text.slice(0, 279)}…` : text}`;
  const punishmentRecord = [
    recordPart("Blacklist Records", blacklist),
    recordPart("Secret Service Records", secret),
    recordPart("[x]Tracker Records", xtracker),
  ].join("\n\n");
  const accountSection = [
    `**Roblox User ID:** ${user.id}`,
    `**Account Created:** ${created ? `${discordTimestamp(created, "D")} (${discordTimestamp(created, "R")})` : "Unknown"}`,
    `**Badges:** ${badgeCountLabel}`,
    `**Username Changes:** ${stat(history.length)}`,
    `**Friends:** ${stat(friends.friends)}`,
    `**Game Passes:** ${inventoryStat(inventorySignals.gamepassCount, inventorySignals.gamepassCapped)}`,
    `**Items:** ${inventoryStat(inventorySignals.itemCount, inventorySignals.itemCapped)}`,
    `[Open Inventory](https://www.roblox.com/users/${user.id}/inventory/)`,
  ].join("\n");
  // A lookup with nothing to report reads as None instead of a green status.
  const exploitSection = exploitWatcher.status.startsWith("🟢") && !exploitWatcher.accounts.length
    ? "None"
    : [exploitWatcher.status, exploitWatcherEvidence].filter(Boolean).join("\n");
  const robloxSection = robloxWatcher.status.startsWith("No linked") && !robloxWatcher.accounts.length
    ? "None"
    : robloxWatcherField || "None";
  // The watcher labels stay small and sit directly under the punishment
  // records, without dividers between them.
  const watcherSections = [
    `**Roblox Watcher:**\n${robloxSection}`,
    `**Exploit Watcher:**\n${exploitSection}`,
  ].join("\n\n");
  const badgeChartSection = inventoryPrivate
    ? "Badge inventory is set to private. Cannot draw badge history."
    : badgeChartError ? `Badge chart unavailable: ${badgeChartError}` : "No badge history is available.";
  const discordCreated = discordUser?.createdAt;
  const discordRisk = discordAltRisk(discordCreated);
  const combinedRisk = combinedAltRisk(risk.score, discordRisk?.score);
  const discordAccountSection = formatDiscordAccountSection(discordId, discordUser);
  const altRiskSection = [
    `**Roblox Account:** ${risk.score}% — ${band}`,
    `**Discord User:** ${discordRisk ? `${discordRisk.score}% — ${discordRisk.band}` : "Unknown"}`,
    `**Combined:** ${combinedRisk}% — ${formatRiskBand(combinedRisk)}`,
  ].join("\n");
  const divisionHistorySection = divisionHistory.unavailable
    ? "Division history could not be loaded from the public sheet."
    : formatDivisionHistory(divisionHistory.stints);
  // Everything lives in the description so the section titles can use Markdown
  // headers; Discord does not render headers inside embed field values.
  const sections = [
    `## Roblox Account\n${accountSection}`,
    discordAccountSection,
    `## Alt Risk\n${altRiskSection}${aiNote ? `\n**Roblox AI Note:** ${aiNote.slice(0, 500)}` : ""}`,
    `## Ranks & Division\n${formatGroups(groups)}`,
    `## Division History\n${divisionHistorySection}`,
    `## Punishment Record\n${punishmentRecord}\n\n${watcherSections}`,
    ...(!image ? [`## Badge Chart\n${badgeChartSection}`] : []),
  ];
  // Keep each embed under Discord's 4,096-character description limit by
  // starting a continuation embed at the next section boundary.
  const DESCRIPTION_LIMIT = 3900;
  const pages: string[] = [];
  let currentPage = "";
  for (const section of sections) {
    const clipped = section.length > DESCRIPTION_LIMIT ? `${section.slice(0, DESCRIPTION_LIMIT - 1)}…` : section;
    const candidate = currentPage ? `${currentPage}\n${SECTION_DIVIDER}\n${clipped}` : clipped;
    if (candidate.length > DESCRIPTION_LIMIT && currentPage) {
      pages.push(currentPage);
      currentPage = clipped;
    } else {
      currentPage = candidate;
    }
  }
  if (currentPage) pages.push(currentPage);
  const embeds = pages.map((description, index) => {
    const pageEmbed = new EmbedBuilder()
      .setTitle(index === 0 ? user.name : `${user.name} (continued)`)
      .setURL(`https://www.roblox.com/users/${user.id}/profile`)
      .setDescription(`${description}${index === pages.length - 1 ? "\n\n-# New public databases may be added in future updates." : ""}`)
      .setColor(embedColor("Background Check"))
      .setFooter({ text: footer() });
    if (index === 0 && avatar) pageEmbed.setThumbnail(avatar.url);
    if (index === 0 && image) pageEmbed.setImage("attachment://badge-history.png");
    return pageEmbed;
  });
  return {
    embeds,
    ...(image ? { image: new AttachmentBuilder(image, { name: "badge-history.png" }) } : {}),
    mentions,
    user,
  };
}

async function badgeCountReport(username: string, signal: AbortSignal): Promise<{ embed: EmbedBuilder; image?: AttachmentBuilder }> {
  const user = await resolveUser(username, signal);
  const [details, badges, avatar] = await Promise.all([
    fetchProfileDetails(user.id, signal),
    fetchBadges(user.id, signal),
    fetchRobloxAvatar(user.id, signal).catch((error) => {
      if (signal.aborted) throw error;
      log("Roblox avatar unavailable", error);
      return undefined;
    }),
  ]);
  if (signal.aborted) throw signal.reason;
  const created = detailsCreated(details);
  const embed = new EmbedBuilder()
    .setTitle(user.name)
    .setURL(`https://www.roblox.com/users/${user.id}/profile`)
    .setDescription([
      `Roblox User ID \`${user.id}\``,
      `Roblox Account Created ${created ? `${discordTimestamp(created, "D")} (${discordTimestamp(created, "R")})` : "Unknown"}`,
    ].join("\n"))
    .setColor(embedColor("Badge Count"))
    .setFooter({ text: footer() });
  if (avatar) embed.setThumbnail(avatar.url);
  if (!badges.length) {
    embed.addFields({ name: "Badge Chart", value: "No badge award history is available for this account." });
    return { embed };
  }
  try {
    const chartColor = CHART_COLORS[getSetting("chart_color", DEFAULT_CHART_COLOR)]?.[0] ?? CHART_COLORS[DEFAULT_CHART_COLOR]![0];
    const chart = await makeBadgeChart(user.name, badges, chartColor, avatar?.png, user.id);
    if (signal.aborted) throw signal.reason;
    embed.setImage("attachment://badge-history.png");
    return { embed, image: new AttachmentBuilder(chart, { name: "badge-history.png" }) };
  } catch (error) {
    if (signal.aborted) throw error;
    log("Badge chart unavailable", error);
    embed.addFields({ name: "Badge Chart", value: errorText(error, "The badge chart could not be generated.").slice(0, 1024) });
    return { embed };
  }
}

function isOwner(userId: string): boolean {
  return userId === OWNER_ID;
}

// Opening the panel is owner-only. The menu, modal, and color handlers also
// check isOwner, so a leaked message cannot change anything either.
export async function sendAdminPanel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isOwner(interaction.user.id)) return replyDenied(interaction);
  await interaction.reply({
    embeds: [createAdminPanelEmbed()],
    components: [createAdminPanelMenu(), createAuthorizedUsersMenu()],
  });
}

function isInteractionAuthorized(interaction: { user: { id: string }; member: unknown }): boolean {
  const member = interaction.member instanceof Object && "roles" in interaction.member
    ? interaction.member as { roles: unknown }
    : null;
  return authorized(interaction.user.id, memberRoles(member));
}

function isCommandAuthorized(interaction: ChatInputCommandInteraction): boolean {
  return isInteractionAuthorized(interaction);
}

// Every slash command except /admin (the public admin panel) requires access granted from that panel.
export const ACCESS_CONTROLLED_COMMANDS: ReadonlySet<string> = new Set([
  "background",
  "badge",
  "groups",
  "profile",
  "api",
  "info",
  "changelog",
  "search",
]);

// Authorized users get 10 access-controlled commands per UTC day; the owner is exempt.
export const DAILY_COMMAND_LIMIT = 10;

export interface DailyCommandUsage {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

export function dailyCommandUsage(userId: string, now = new Date()): DailyCommandUsage {
  const row = db.prepare(
    "SELECT command_count AS count FROM daily_command_usage WHERE discord_user_id = ? AND usage_day = ?",
  ).get(userId, utcDay(now)) as { count: number } | undefined;
  const used = Number(row?.count ?? 0);
  return {
    allowed: used < DAILY_COMMAND_LIMIT,
    used,
    limit: DAILY_COMMAND_LIMIT,
    remaining: Math.max(0, DAILY_COMMAND_LIMIT - used),
    resetAt: nextUtcMidnight(now),
  };
}

export function consumeDailyCommand(userId: string, now = new Date()): DailyCommandUsage {
  const usage = dailyCommandUsage(userId, now);
  if (!usage.allowed) return usage;
  db.prepare(`
    INSERT INTO daily_command_usage (discord_user_id, usage_day, command_count)
    VALUES (?, ?, 1)
    ON CONFLICT(discord_user_id, usage_day) DO UPDATE SET
      command_count = command_count + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, utcDay(now));
  return {
    ...usage,
    allowed: true,
    used: usage.used + 1,
    remaining: Math.max(0, usage.remaining - 1),
  };
}

export function resetDailyCommandUsage(userId: string): void {
  db.prepare("DELETE FROM daily_command_usage WHERE discord_user_id = ?").run(userId);
}

// One access-controlled command per minute per user; the owner is exempt.
export const COMMAND_COOLDOWN_MS = 60_000;

export function commandCooldownRemaining(userId: string, now = Date.now()): number {
  const last = lastCommandAt.get(userId);
  if (last === undefined) return 0;
  return Math.max(0, COMMAND_COOLDOWN_MS - (now - last));
}

export function recordCommandUse(userId: string, now = Date.now()): void {
  lastCommandAt.set(userId, now);
}

export function resetCommandCooldown(userId: string): void {
  lastCommandAt.delete(userId);
}

export interface CommandDailyUsage {
  command: string;
  label: string;
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

// Lookup commands keep a separate daily budget per command.
export const COMMAND_DAILY_LIMITS: Readonly<Record<string, { limit: number; label: string }>> = {
  background: { limit: 5, label: "/background check" },
  badge: { limit: 5, label: "/badge count" },
  groups: { limit: 5, label: "/groups" },
};

export function commandDailyUsage(userId: string, commandName: string, now = new Date()): CommandDailyUsage {
  const config = COMMAND_DAILY_LIMITS[commandName] ?? { limit: 0, label: `/${commandName}` };
  const row = db.prepare(
    "SELECT command_count AS count FROM command_daily_usage WHERE discord_user_id = ? AND usage_day = ? AND command_name = ?",
  ).get(userId, utcDay(now), commandName) as { count: number } | undefined;
  const used = Number(row?.count ?? 0);
  return {
    command: commandName,
    label: config.label,
    allowed: used < config.limit,
    used,
    limit: config.limit,
    remaining: Math.max(0, config.limit - used),
    resetAt: nextUtcMidnight(now),
  };
}

export function consumeCommandDailyUsage(userId: string, commandName: string, now = new Date()): CommandDailyUsage {
  const usage = commandDailyUsage(userId, commandName, now);
  if (!usage.allowed) return usage;
  db.prepare(`
    INSERT INTO command_daily_usage (discord_user_id, usage_day, command_name, command_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(discord_user_id, usage_day, command_name) DO UPDATE SET
      command_count = command_count + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, utcDay(now), commandName);
  return {
    ...usage,
    allowed: true,
    used: usage.used + 1,
    remaining: Math.max(0, usage.remaining - 1),
  };
}

export function resetCommandDailyUsage(userId: string): void {
  db.prepare("DELETE FROM command_daily_usage WHERE discord_user_id = ?").run(userId);
}

function createDailyLimitEmbed(usage: DailyCommandUsage): EmbedBuilder {
  return makeEmbed(
    "Daily Limit Reached",
    `You have used all **${usage.limit}** commands for today. Your limit resets ${discordTimestamp(usage.resetAt, "R")}.`,
    "Warning",
  ).addFields(
    { name: "Used Today", value: `${usage.used}/${usage.limit}`, inline: true },
    { name: "Resets", value: discordTimestamp(usage.resetAt, "D"), inline: true },
  );
}

function createCommandDailyLimitEmbed(usage: CommandDailyUsage): EmbedBuilder {
  return makeEmbed(
    "Daily Limit Reached",
    `You have used all **${usage.limit}** ${usage.label} commands for today. Your limit resets ${discordTimestamp(usage.resetAt, "R")}.`,
    "Warning",
  ).addFields(
    { name: "Used Today", value: `${usage.used}/${usage.limit}`, inline: true },
    { name: "Resets", value: discordTimestamp(usage.resetAt, "D"), inline: true },
  );
}

export function createCooldownEmbed(remainingMs: number): EmbedBuilder {
  const readyAt = new Date(Date.now() + Math.max(0, remainingMs));
  return makeEmbed(
    "Rate Limit Exceeded",
    `You can run another command ${discordTimestamp(readyAt, "R")}. Each user can run one command per minute.`,
    "Warning",
  );
}

type InteractionLogEntry = {
  action: string;
  access: string;
  user: string;
  userId: string;
  server: string;
  channel: string;
  interactionId: string;
  messageLink: string;
  changed?: string;
};

export function createInteractionLogEmbed(entry: InteractionLogEntry): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Bot Interaction")
    .setColor(embedColor("Bot Interaction"))
    .addFields(
      { name: "Action", value: entry.action.slice(0, 1024), inline: true },
      { name: "Access", value: entry.access.toUpperCase(), inline: true },
      { name: "User", value: `<@${entry.userId}>`, inline: true },
      { name: "Username", value: entry.user.slice(0, 256) || NONE, inline: true },
      { name: "User ID", value: entry.userId, inline: true },
      { name: "Server", value: entry.server.slice(0, 1024), inline: true },
      { name: "Channel", value: entry.channel.slice(0, 1024), inline: true },
      { name: "Interaction ID", value: entry.interactionId, inline: true },
      { name: "Message Link", value: entry.messageLink.slice(0, 1024), inline: true },
    )
    .setFooter({ text: footer() });
  if (entry.changed) embed.addFields({ name: "Changed", value: entry.changed.slice(0, 1024), inline: false });
  return embed;
}

async function interactionMessageLink(interaction: Interaction): Promise<string> {
  if (interaction.isMessageComponent()) return interaction.message.url;
  if (!interaction.isRepliable() || (!interaction.deferred && !interaction.replied)) return "Unavailable";
  try {
    return (await interaction.fetchReply()).url;
  } catch (error) {
    log("Unable to resolve interaction message link", error);
    return "Unavailable";
  }
}

export interface InteractionLogLocations {
  server: string;
  channel: string;
}

// Build clickable server/channel links while keeping the raw IDs visible in the log.
export function interactionLogLocations(input: {
  guildId?: string | null;
  guildName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
}): InteractionLogLocations {
  const { guildId, guildName, channelId, channelName } = input;
  const serverName = guildName?.trim() || guildId || "Direct message";
  const server = guildId
    ? `[${serverName}](https://discord.com/channels/${guildId}) (${guildId})`
    : "Direct message";
  if (!channelId) return { server, channel: channelName?.trim() || "Unavailable" };
  const channelLabel = channelName?.trim() || (guildId ? channelId : "Direct message");
  const channelUrl = guildId
    ? `https://discord.com/channels/${guildId}/${channelId}`
    : `https://discord.com/channels/@me/${channelId}`;
  return { server, channel: `[${channelLabel}](${channelUrl}) (${channelId})` };
}

function interactionChannelName(interaction: Interaction): string | undefined {
  const channel = interaction.channel;
  if (!channel) return undefined;
  if ("name" in channel && typeof channel.name === "string" && channel.name) return channel.name;
  if ("recipient" in channel) {
    const recipient = (channel as { recipient?: { username?: string } | null }).recipient;
    if (recipient?.username) return recipient.username;
  }
  return undefined;
}

const adminInteractionChanges = new WeakMap<Interaction, string>();
const commandGateOutcomes = new WeakMap<Interaction, "allowed" | "denied" | "limited">();

function isAdminInteraction(interaction: Interaction): boolean {
  if (interaction.isChatInputCommand()) return interaction.commandName === "admin";
  if (interaction.isStringSelectMenu()) {
    return interaction.customId === "admin-panel"
      || interaction.customId === "admin-authorized-user"
      || interaction.customId === "admin-status"
      || interaction.customId.startsWith("admin-color-target")
      || interaction.customId.startsWith("admin-color-value:");
  }
  return interaction.isModalSubmit() && interaction.customId.startsWith("admin-panel:");
}

function recordAdminChange(interaction: Interaction, changed: string): void {
  adminInteractionChanges.set(interaction, changed);
}

async function logInteractionAttempt(interaction: Interaction): Promise<void> {
  let action = `interaction:${interaction.type}`;
  let access = "not-required";

  if (interaction.isChatInputCommand()) {
    const subcommand = interaction.options.getSubcommand(false);
    action = `/${interaction.commandName}${subcommand ? ` ${subcommand}` : ""}`;
    access = commandGateOutcomes.get(interaction)
      ?? (!ACCESS_CONTROLLED_COMMANDS.has(interaction.commandName) || isCommandAuthorized(interaction) ? "allowed" : "denied");
  } else if (interaction.isButton()) {
    action = `button:${interaction.customId}`;
  } else if (interaction.isStringSelectMenu()) {
    action = `select:${interaction.customId}${interaction.values.length ? `:${interaction.values.join(",")}` : ""}`;
    if (interaction.customId === "admin-panel") access = isOwner(interaction.user.id) ? "allowed" : "denied";
    else if (interaction.customId === "admin-authorized-user") access = isOwner(interaction.user.id) ? "allowed" : "denied";
    else if (interaction.customId === "admin-status") access = isOwner(interaction.user.id) ? "allowed" : "denied";
    else if (interaction.customId.startsWith("admin-color-target") || interaction.customId.startsWith("admin-color-value:")) {
      access = isOwner(interaction.user.id) ? "allowed" : "denied";
    }
  } else if (interaction.isModalSubmit()) {
    action = `modal:${interaction.customId}`;
    if (interaction.customId.startsWith("admin-panel:")) access = isOwner(interaction.user.id) ? "allowed" : "denied";
  }

  const audit = { action, access, user: interaction.user.username, userId: interaction.user.id };
  log(`${access === "denied" ? "DENIED interaction attempt" : "Interaction attempt"} ${JSON.stringify(audit)}`);
  const isAdmin = isAdminInteraction(interaction);
  const location = interactionLogLocations({
    guildId: interaction.guildId,
    guildName: interaction.guild?.name,
    channelId: interaction.channelId,
    channelName: interactionChannelName(interaction),
  });
  await sendLogEmbed(createInteractionLogEmbed({
    ...audit,
    server: location.server,
    channel: location.channel,
    interactionId: interaction.id,
    messageLink: await interactionMessageLink(interaction),
    ...(isAdmin ? {
      changed: adminInteractionChanges.get(interaction)
        ?? (access === "denied" ? "No changes (access denied)." : "No settings changed."),
    } : {}),
  }));
}

async function replyDenied(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = deniedEmbed("Ask the bot owner to grant access.");
  embed.addFields({ name: "Your Discord ID", value: interaction.user.id, inline: true });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

interface BackgroundCheckRequest {
  username?: string | null;
  discord?: string | null;
}

async function sendBackgroundCheck(interaction: ChatInputCommandInteraction, request: BackgroundCheckRequest): Promise<void> {
  if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
  const usernameInput = request.username?.trim() ?? "";
  const discordId = parseDiscordId(request.discord?.trim() ?? "");
  if (!discordId) {
    await interaction.reply({ embeds: [makeEmbed("Invalid Background Query", "Provide a numeric Discord user ID (15-22 digits) in the discord option.", "Warning")] });
    return;
  }
  if (!usernameInput) {
    await interaction.reply({ embeds: [makeEmbed("Invalid Background Query", "Provide the Roblox username to check.", "Warning")] });
    return;
  }
  let normalized: string;
  try {
    normalized = validateRobloxUsername(usernameInput);
  } catch (error) {
    await interaction.reply({ embeds: [makeEmbed("Invalid Roblox Username", errorText(error, "Enter a valid Roblox username."), "Warning")] });
    return;
  }
  await interaction.deferReply();
  const controller = new AbortController();
  const deadline = Date.now() + BACKGROUND_CHECK_TIMEOUT_MS;
  let deadlineExpired = false;
  let timeout: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<{ kind: "timeout" }>((resolve) => {
    timeout = setTimeout(() => {
      deadlineExpired = true;
      controller.abort();
      resolve({ kind: "timeout" });
    }, BACKGROUND_CHECK_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([
      (async () => {
        return { kind: "ready" as const, result: await backgroundCheck(normalized, controller.signal, undefined, discordId) };
      })(),
      timedOut,
    ]);
    if (outcome.kind === "timeout" || Date.now() >= deadline) {
      controller.abort();
      await interaction.editReply({
        embeds: [makeEmbed("Background Check Timed Out", "The background check took too long and was cancelled. Please try again.", "Warning")],
        files: [],
      });
      return;
    }
    await interaction.editReply({
      embeds: outcome.result.embeds,
      files: outcome.result.image ? [outcome.result.image] : [],
      components: [],
      // The client blocks mentions by default; allow exactly the linked accounts shown.
      allowedMentions: { parse: [], users: outcome.result.mentions },
    });
  } catch (error) {
    if (deadlineExpired) {
      await interaction.editReply({
        embeds: [makeEmbed("Background Check Timed Out", "The background check took too long and was cancelled. Please try again.", "Warning")],
        files: [],
      });
      return;
    }
    log("Background check failed", error);
    await interaction.editReply({ embeds: [makeEmbed("Could Not Look Up User", errorText(error, "Something went wrong while processing this Roblox user. Please try again."), "Warning")] });
  } finally {
    clearTimeout(timeout!);
  }
}

async function sendBadgeCount(interaction: ChatInputCommandInteraction, username: string): Promise<void> {
  if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
  let normalized: string;
  try {
    normalized = validateRobloxUsername(username);
  } catch (error) {
    await interaction.reply({ embeds: [makeEmbed("Invalid Roblox Username", errorText(error, "Enter a valid Roblox username."), "Warning")] });
    return;
  }
  await interaction.deferReply();
  const controller = new AbortController();
  let deadlineExpired = false;
  let timeout: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<{ kind: "timeout" }>((resolve) => {
    timeout = setTimeout(() => {
      deadlineExpired = true;
      controller.abort();
      resolve({ kind: "timeout" });
    }, BACKGROUND_CHECK_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([
      badgeCountReport(normalized, controller.signal).then((result) => ({ kind: "ready" as const, result })),
      timedOut,
    ]);
    if (outcome.kind === "timeout") {
      await interaction.editReply({ embeds: [makeEmbed("Badge Count Timed Out", "The badge count took too long and was cancelled. Please try again.", "Warning")], files: [] });
      return;
    }
    await interaction.editReply({
      embeds: [outcome.result.embed],
      files: outcome.result.image ? [outcome.result.image] : [],
      components: [],
    });
  } catch (error) {
    if (deadlineExpired) {
      await interaction.editReply({ embeds: [makeEmbed("Badge Count Timed Out", "The badge count took too long and was cancelled. Please try again.", "Warning")], files: [] });
      return;
    }
    log("Badge count failed", error);
    await interaction.editReply({
      embeds: [makeEmbed("Could Not Load Badge Count", errorText(error, "Something went wrong while loading badge history. Please try again."), "Warning")],
      components: [],
    });
  } finally {
    clearTimeout(timeout!);
  }
}

async function sendGroups(interaction: ChatInputCommandInteraction, username: string): Promise<void> {
  if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
  let normalized: string;
  try { normalized = validateRobloxUsername(username); }
  catch (error) { await interaction.reply({ embeds: [makeEmbed("Invalid Roblox Username", errorText(error, "Enter a valid Roblox username."), "Warning")] }); return; }
  await interaction.deferReply();
  try {
    const user = await resolveUser(normalized);
    await interaction.editReply({ embeds: [createGroupsEmbed(user.name, await fetchGroups(user.id))] });
  } catch (error) {
    log("Groups lookup failed", error);
    await interaction.editReply({ embeds: [makeEmbed("Could Not Load Groups", errorText(error, "Something went wrong while loading this user's CBRN groups. Please try again."), "Warning")] });
  }
}

async function sendProfileLink(interaction: ChatInputCommandInteraction, username: string): Promise<void> {
  if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
  let normalized: string;
  try { normalized = validateRobloxUsername(username); }
  catch (error) { await interaction.reply({ embeds: [makeEmbed("Invalid Roblox Username", errorText(error, "Enter a valid Roblox username."), "Warning")] }); return; }
  await interaction.deferReply();
  try {
    const user = await resolveUser(normalized);
    await interaction.editReply({ embeds: [createProfileLinkEmbed(user.name, user.id)] });
  } catch (error) {
    log("Profile link lookup failed", error);
    await interaction.editReply({ embeds: [makeEmbed("Could Not Load Profile", errorText(error, "Something went wrong while looking up this Roblox profile. Please try again."), "Warning")] });
  }
}

function configureCommand<T extends SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder>(command: T): T {
  return command
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ) as T;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  descriptions: string[];
}

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## (\d+\.\d+\.\d+(?:-[\w.-]+)?) - (\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (heading) {
      current = { version: heading[1]!, date: heading[2]!, descriptions: [] };
      entries.push(current);
    } else if (/^#{1,2}\s/.test(line)) {
      current = undefined;
    } else if (current && /^-\s+\S/.test(line)) {
      current.descriptions.push(line.replace(/^-\s+/, "").trim());
    }
  }
  return entries;
}

export function createChangelogEmbed(markdown: string): EmbedBuilder {
  const entries = parseChangelog(markdown);
  if (!entries.length) {
    return makeEmbed("Change Log Unavailable", "No releases are recorded in the change log yet.", "Warning");
  }
  // One field per release lets pagination split releases across pages instead
  // of truncating the whole change log to a single description.
  const embed = makeEmbed("Change Log", "Every release, newest first.", "Info");
  embed.addFields(changelogFields(entries));
  return embed;
}

const CHANGELOG_FIELD_LIMIT = 25;

function changelogFields(entries: ChangelogEntry[]): Array<{ name: string; value: string; inline: boolean }> {
  const fields = entries.flatMap(changelogEntryFields);
  if (fields.length <= CHANGELOG_FIELD_LIMIT) return fields;
  // An embed holds 25 fields. Once the change log outgrows that, keep the
  // newest releases as their own fields and pack the oldest releases together,
  // headings included, so no release is lost.
  for (let keep = entries.length - 1; keep >= 0; keep -= 1) {
    const head = entries.slice(0, keep).flatMap(changelogEntryFields);
    const slots = CHANGELOG_FIELD_LIMIT - head.length;
    if (slots < 1) continue;
    const tail = packChangelogReleases(entries.slice(keep), slots);
    if (tail) return [...head, ...tail];
  }
  return fields.slice(0, CHANGELOG_FIELD_LIMIT);
}

function packChangelogReleases(
  entries: ChangelogEntry[],
  slots: number,
): Array<{ name: string; value: string; inline: boolean }> | undefined {
  const packed: Array<{ name: string; value: string; inline: boolean }> = [];
  let current: { name: string; lines: string[]; length: number } | undefined;
  const flush = (): void => {
    if (!current) return;
    packed.push({ name: current.name.slice(0, 256), value: current.lines.join("\n"), inline: false });
    current = undefined;
  };
  for (const entry of entries) {
    const lines = [
      `**${entry.version} - ${entry.date}**`,
      ...(entry.descriptions.length ? entry.descriptions.map((description) => `- ${description}`) : ["- No changes recorded."]),
    ];
    // Pack line by line so a release fills the rest of the current field before
    // starting a new one; whole-entry packing wasted that space and dropped
    // older releases once the change log outgrew Discord's 25-field limit.
    for (const line of lines) {
      for (const value of chunkText(line, 1024)) {
        if (current && current.length + value.length + 1 > 1024) flush();
        current ??= { name: `${entry.version} - ${entry.date} (older releases)`, lines: [], length: 0 };
        current.lines.push(value);
        current.length += value.length + 1;
      }
    }
  }
  flush();
  return packed.length <= slots ? packed : undefined;
}

function chunkText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function changelogEntryFields(entry: ChangelogEntry): Array<{ name: string; value: string; inline: boolean }> {
  const text = entry.descriptions.map((description) => `- ${description}`).join("\n") || "No changes recorded.";
  const chunks = chunkText(text, 1024);
  return chunks.map((value, index) => ({
    name: `${entry.version} - ${entry.date}${index ? " (cont.)" : ""}`.slice(0, 256),
    value,
    inline: false,
  }));
}

export async function loadChangelogEmbed(): Promise<EmbedBuilder> {
  try {
    return createChangelogEmbed(await readFile(CHANGELOG_PATH, "utf8"));
  } catch (error) {
    log("Unable to read the change log", error);
    return makeEmbed("Change Log Unavailable", "The change log could not be loaded. Please contact the bot owner.", "Warning");
  }
}

export const commands = [
  new SlashCommandBuilder()
    .setName("background")
    .setDescription("Run a Roblox background check.")
    .addSubcommand((sub) => sub
      .setName("check")
      .setDescription("Run a full background check with a badge chart.")
      .addStringOption((option) => option
        .setName("username")
        .setDescription("The Roblox username to check")
        .setRequired(true))
      .addStringOption((option) => option
        .setName("discord")
        .setDescription("The Discord user ID this check is for")
        .setRequired(true))),
  new SlashCommandBuilder()
    .setName("badge")
    .setDescription("Generate a Roblox user's badge chart.")
    .addSubcommand((sub) => sub
      .setName("count")
      .setDescription("Generate the badge chart for one Roblox user.")
      .addStringOption((option) => option
        .setName("username")
        .setDescription("The Roblox username to check")
        .setRequired(true))),
  new SlashCommandBuilder().setName("api").setDescription("Check every connected API and service status."),
  new SlashCommandBuilder()
    .setName("groups")
    .setDescription("Check a user's CBRN groups and ranks.")
    .addStringOption((option) => option
      .setName("username")
      .setDescription("The Roblox username to check")
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Get a Roblox user's profile link.")
    .addStringOption((option) => option
      .setName("username")
      .setDescription("The Roblox username to link")
      .setRequired(true)),
  new SlashCommandBuilder().setName("info").setDescription("Show bot statistics, commands, and health."),
  new SlashCommandBuilder()
    .setName("changelog")
    .setDescription("Show recent releases and changes."),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Find every logged interaction by username, user ID, or interaction ID.")
    .addStringOption((option) => option
      .setName("query")
      .setDescription("A Discord or Roblox username, Discord user ID, or interaction ID")
      .setRequired(true)),
  new SlashCommandBuilder().setName("ping").setDescription("Check the bot's Discord latency and uptime."),
  new SlashCommandBuilder().setName("admin").setDescription("Open the bot owner admin panel."),
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset your own CyberGuard Helper password.")
    .addSubcommand((sub) => sub
      .setName("password")
      .setDescription("Reset your CyberGuard Helper password to a new default one SergeantGuru DMs you here.")),
].map(configureCommand);

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.commandName;
  const controlled = ACCESS_CONTROLLED_COMMANDS.has(name);
  const owner = isOwner(interaction.user.id);
  if (controlled && !isCommandAuthorized(interaction)) {
    commandGateOutcomes.set(interaction, "denied");
    return replyDenied(interaction);
  }
  if (controlled && !owner) {
    const waitMs = commandCooldownRemaining(interaction.user.id);
    if (waitMs > 0) {
      commandGateOutcomes.set(interaction, "limited");
      await interaction.reply({ embeds: [createCooldownEmbed(waitMs)], ephemeral: true });
      return;
    }
    const perCommand = COMMAND_DAILY_LIMITS[name];
    if (perCommand) {
      const commandUsage = commandDailyUsage(interaction.user.id, name);
      if (!commandUsage.allowed) {
        commandGateOutcomes.set(interaction, "limited");
        await interaction.reply({ embeds: [createCommandDailyLimitEmbed(commandUsage)], ephemeral: true });
        return;
      }
    }
    const usage = consumeDailyCommand(interaction.user.id);
    if (!usage.allowed) {
      commandGateOutcomes.set(interaction, "limited");
      await interaction.reply({ embeds: [createDailyLimitEmbed(usage)], ephemeral: true });
      return;
    }
    if (perCommand) consumeCommandDailyUsage(interaction.user.id, name);
    recordCommandUse(interaction.user.id);
  }
  commandGateOutcomes.set(interaction, "allowed");
  if (name === "background" && interaction.options.getSubcommand() === "check") {
    return sendBackgroundCheck(interaction, {
      discord: interaction.options.getString("discord"),
      username: interaction.options.getString("username"),
    });
  }
  if (name === "badge" && interaction.options.getSubcommand() === "count") return sendBadgeCount(interaction, interaction.options.getString("username", true));
  if (name === "groups") return sendGroups(interaction, interaction.options.getString("username", true));
  if (name === "profile") return sendProfileLink(interaction, interaction.options.getString("username", true));
  if (name === "api") return sendApiStatus(interaction);
  if (name === "changelog") {
    if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
    const pagination = buildPagination(await loadChangelogEmbed());
    await interaction.reply({ embeds: pagination.embeds, components: pagination.components });
    return;
  }
  if (name === "ping") return sendPing(interaction);
  if (name === "admin") return sendAdminPanel(interaction);
  if (name === "reset" && interaction.options.getSubcommand() === "password") return sendPasswordReset(interaction);
  if (name === "info") {
    const stats = db.prepare("SELECT (SELECT COUNT(*) FROM authorized_users) AS users, (SELECT COUNT(*) FROM authorized_roles) AS roles").get() as JsonObject;
    let robloxOnline = false;
    try { robloxOnline = (await requestJson(`${ROBLOX_USERS}/users/1`)).ok; } catch {}
    const guilds = client.guilds.cache;
    const pagination = buildPagination(createInfoEmbed({
      pingMs: Math.round(client.ws.ping),
      servers: guilds.size,
      totalUsers: guilds.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0),
      uptimeSeconds: (Date.now() - startTime) / 1000,
      commandCount: commands.length,
      authorizedUsers: Number(stats["users"] ?? 0),
      authorizedRoles: Number(stats["roles"] ?? 0),
      botId: client.user?.id ?? NONE,
      memoryMb: process.memoryUsage().rss / 1024 / 1024,
      robloxOnline,
      robloxCloud: Boolean(robloxApiKey),
      xtracker: Boolean(xtrackerApiKey),
      robloxWatcher: Boolean(robloxWatcherApiKey),
      exploitWatcher: Boolean(exploitWatcherApiKey),
      dailyUsage: isOwner(interaction.user.id) ? null : dailyCommandUsage(interaction.user.id),
    }));
    await interaction.reply({ embeds: pagination.embeds, components: pagination.components });
    return;
  }
  if (name === "search") {
    if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
    const query = interaction.options.getString("query", true).trim();
    if (!query || query.length > 32 || (/^\d+$/.test(query) && !isDiscordUserId(query))) {
      await interaction.reply({ embeds: [makeEmbed("Invalid Search Query", "Enter a Discord username or a valid 15-to-22-digit Discord user or interaction ID.", "Warning")] });
      return;
    }

    await interaction.deferReply();
    const terms = new Set<string>([query]);
    const { messages, scanned, complete } = await findInteractionLogs([...terms]);
    const termList = [...terms];
    if (!messages.length) {
      const scope = complete
        ? `No matching log entries were found for **${query}** across ${scanned.toLocaleString("en-US")} scanned log messages.`
        : `No matching log entries were found for **${query}** in the latest ${scanned.toLocaleString("en-US")} log messages (search limit reached).`;
      await interaction.editReply({
        embeds: [makeEmbed("No Interactions Found", scope, "Warning")],
      });
      return;
    }

    const results = messages.map((message): InteractionSearchResult => {
      const audit = message.embeds.find((embed) => termList.some((term) => matchesInteractionLog(embed, term)));
      const field = (name: string): string => audit?.fields.find((item) => item.name === name)?.value ?? NONE;
      return {
        action: field("Action"),
        access: field("Access"),
        user: field("User"),
        userId: field("User ID"),
        interactionId: field("Interaction ID"),
        url: message.url,
      };
    });
    const pagination = buildPaginationFromPages(createSearchResultEmbeds(query, results, scanned, complete));
    await interaction.editReply({ embeds: pagination.embeds, components: pagination.components });
  }
}

export interface InteractionSearchResult {
  action: string;
  access: string;
  user: string;
  userId: string;
  interactionId: string;
  url: string;
}

export function createSearchResultEmbeds(
  query: string,
  results: InteractionSearchResult[],
  scanned: number,
  complete: boolean,
): EmbedBuilder[] {
  const scope = complete
    ? `across ${scanned.toLocaleString("en-US")} scanned log messages`
    : `in the latest ${scanned.toLocaleString("en-US")} log messages (search limit reached)`;
  const summary = `Found ${results.length.toLocaleString("en-US")} matching ${results.length === 1 ? "interaction" : "interactions"} for **${query}** ${scope}.`;
  const description = summary.slice(0, 4096);
  // Each result is four lines, so keep to the same 15-line page target as the
  // rest of the bot. This also stays under Discord's 25-field embed limit.
  const resultsPerPage = Math.max(1, Math.floor(PAGE_LINE_LIMIT / 4));
  const pages: EmbedBuilder[] = [];
  for (let offset = 0; offset < results.length; offset += resultsPerPage) {
    const chunk = results.slice(offset, offset + resultsPerPage);
    const page = makeEmbed(
      "Interaction Search Results",
      pages.length ? "Continued search results." : description,
      "Success",
    );
    page.addFields(chunk.map((result, index) => ({
      name: `Result ${offset + index + 1}`,
      value: [
        `**${result.action.slice(0, 250)}** — ${result.access}`,
        `User: ${result.user.slice(0, 100)} (${result.userId})`,
        `Interaction ID: ${result.interactionId}`,
        `[Jump to log message](${result.url})`,
      ].join("\n"),
      inline: false,
    })));
    pages.push(page);
  }
  return pages;
}

export function matchesInteractionLog(
  embed: { fields: readonly { name: string; value: string }[]; footer?: { text: string } | null },
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const fieldValue = (name: string) => embed.fields.find((field) => field.name === name)?.value?.trim() ?? "";
  const interactionId = fieldValue("Interaction ID");
  const userId = fieldValue("User ID");
  const username = fieldValue("Username").toLowerCase() || fieldValue("User").toLowerCase();
  const footerId = /\bID: (\d+)(?:$|\s)/.exec(embed.footer?.text ?? "")?.[1];
  // Older logs stored the mention in "User" and the raw username in the footer.
  const mentionId = /^<@!?(\d+)>$/.exec(fieldValue("User"))?.[1];
  const footerUsername = /\| User: (\S+)/.exec(embed.footer?.text ?? "")?.[1]?.toLowerCase();

  return /^\d+$/.test(normalizedQuery)
    ? interactionId === normalizedQuery || userId === normalizedQuery || footerId === normalizedQuery || mentionId === normalizedQuery
    : username === normalizedQuery || footerUsername === normalizedQuery;
}

const MAX_SEARCH_MESSAGES = 100_000;

async function findInteractionLogs(queries: readonly string[]): Promise<{ messages: import("discord.js").Message[]; scanned: number; complete: boolean }> {
  const guild = client.guilds.cache.get(BACKGROUND_CHECK_LOG_GUILD_ID)
    ?? await client.guilds.fetch(BACKGROUND_CHECK_LOG_GUILD_ID);
  const channel = await guild.channels.fetch(BACKGROUND_CHECK_LOG_CHANNEL_ID);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    throw new BotError("The interaction log channel is unavailable or cannot be searched.");
  }

  let before: string | undefined;
  let scanned = 0;
  const matches: import("discord.js").Message[] = [];
  while (scanned < MAX_SEARCH_MESSAGES) {
    const limit = Math.min(100, MAX_SEARCH_MESSAGES - scanned);
    const messages = await channel.messages.fetch({
      limit,
      ...(before ? { before } : {}),
    });
    if (!messages.size) return { messages: matches, scanned, complete: true };
    const batch = [...messages.values()];
    matches.push(...batch.filter((message) => message.embeds.some((embed) => queries.some((query) => matchesInteractionLog(embed, query)))));
    scanned += batch.length;
    before = batch.at(-1)?.id;
    if (batch.length < limit) return { messages: matches, scanned, complete: true };
  }
  return { messages: matches, scanned, complete: false };
}

function formatUptime(seconds: number): string {
  let remaining = Math.floor(seconds);
  const days = Math.floor(remaining / 86400); remaining %= 86400;
  const hours = Math.floor(remaining / 3600); remaining %= 3600;
  const minutes = Math.floor(remaining / 60); const secs = remaining % 60;
  return `${days ? `${days}d ` : ""}${hours ? `${hours}h ` : ""}${minutes ? `${minutes}m ` : ""}${secs}s`;
}

export function commandDescriptions(): string[] {
  return commands.flatMap((command) => {
    const json = command.toJSON();
    const lines = [`• **/${json.name}** — ${json.description}`];
    const subcommands = (json.options ?? []).filter((option) => option.type === ApplicationCommandOptionType.Subcommand);
    for (const subcommand of subcommands) {
      lines.push(`• **/${json.name} ${subcommand.name}** — ${subcommand.description ?? ""}`);
    }
    return lines;
  });
}

type ApiState = "Online" | "Offline" | "Degraded" | "Not configured";

interface ApiCheck {
  name: string;
  state: ApiState;
  detail?: string;
  latencyMs?: number;
}

const API_CHECK_TIMEOUT_MS = 10_000;

function apiStateIcon(state: ApiState): string {
  if (state === "Online") return "🟢";
  if (state === "Offline") return "🔴";
  return "🟡";
}

function errorDetail(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "Timed out";
  return "Unreachable";
}

async function probeEndpoint(
  name: string,
  url: string,
  init: RequestInit = {},
  options: { configured?: boolean; onlineStatuses?: number[] } = {},
): Promise<ApiCheck> {
  if (options.configured === false) return { name, state: "Not configured", detail: "Missing credentials" };
  const start = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(API_CHECK_TIMEOUT_MS) });
    const latencyMs = Date.now() - start;
    if (response.ok) return { name, state: "Online", latencyMs };
    if ((options.onlineStatuses ?? []).includes(response.status)) {
      return { name, state: "Online", detail: `HTTP ${response.status}`, latencyMs };
    }
    if (response.status === 401 || response.status === 403) {
      return { name, state: "Degraded", detail: `Authentication failed (HTTP ${response.status})`, latencyMs };
    }
    return { name, state: "Offline", detail: `HTTP ${response.status}`, latencyMs };
  } catch (error) {
    return { name, state: "Offline", detail: errorDetail(error), latencyMs: Date.now() - start };
  }
}

function checkDiscordGateway(): ApiCheck {
  return {
    name: "Discord Gateway",
    state: client.isReady() ? "Online" : "Offline",
    detail: `${Math.round(client.ws.ping)}ms ping`,
  };
}

async function sendApiStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
  await interaction.deferReply();

  const checks = await Promise.all([
    checkDiscordGateway(),
    probeEndpoint("Roblox Users API", `${ROBLOX_USERS}/users/1`),
    probeEndpoint("Roblox Groups API", `${ROBLOX_GROUPS}/1/groups/roles?limit=1`),
    probeEndpoint("Roblox Friends API", `${ROBLOX_FRIENDS}/1/friends`),
    probeEndpoint(
      "Roblox Open Cloud",
      `${ROBLOX_CLOUD}/users/1/inventory-items?filter=badges%3Dtrue&maxPageSize=1`,
      robloxApiKey ? { headers: { "x-api-key": robloxApiKey } } : {},
      { configured: Boolean(robloxApiKey), onlineStatuses: [404] },
    ),
    probeEndpoint(
      "[x]Tracker",
      `${XTRACKER_API}/api/registry/user?id=1`,
      xtrackerApiKey ? { headers: { authorization: `Bearer ${xtrackerApiKey.replace(/^Bearer\s+/i, "")}` } } : {},
      { configured: Boolean(xtrackerApiKey), onlineStatuses: [404] },
    ),
    probeEndpoint(
      "Roblox Watcher",
      `${ROBLOX_WATCHER_API}/roblox/search/1`,
      robloxWatcherApiKey ? { headers: { authorization: `Bearer ${robloxWatcherApiKey.replace(/^Bearer\s+/i, "")}` } } : {},
      { configured: Boolean(robloxWatcherApiKey), onlineStatuses: [404] },
    ),
    probeEndpoint(
      "Exploit Watcher",
      `${EXPLOIT_WATCHER_API}/roblox/search/1`,
      exploitWatcherApiKey ? { headers: { authorization: `Bearer ${exploitWatcherApiKey.replace(/^Bearer\s+/i, "")}` } } : {},
      { configured: Boolean(exploitWatcherApiKey), onlineStatuses: [404] },
    ),
  ]);

  await interaction.editReply({ embeds: [createApiStatusEmbed(checks)] });
}

export function createApiStatusEmbed(checks: ApiCheck[]): EmbedBuilder {
  const online = checks.filter((check) => check.state === "Online").length;
  return makeEmbed(
    "API Status",
    `**${online}/${checks.length}** integrations are online. Every service is checked live when you run this command.`,
    "Info",
  ).addFields(checks.map((check) => ({
    name: `${apiStateIcon(check.state)} ${check.name}`,
    value: `${check.state}${check.detail ? ` — ${check.detail}` : ""}${check.latencyMs !== undefined ? `\n${check.latencyMs}ms` : ""}`,
    inline: true,
  })));
}

export interface PingSnapshot {
  gatewayMs: number;
  roundtripMs: number;
  uptimeSeconds: number;
}

export function createPingEmbed(info: PingSnapshot): EmbedBuilder {
  return makeEmbed(
    "Ping",
    [`**Discord gateway** ${info.gatewayMs}ms`, `**Round trip** ${info.roundtripMs}ms`].join("\n"),
    "Info",
  ).addFields(
    { name: "Uptime", value: formatUptime(info.uptimeSeconds), inline: true },
    { name: "Status", value: "Online", inline: true },
    { name: "Version", value: BOT_VERSION, inline: true },
  );
}

async function sendPing(interaction: ChatInputCommandInteraction): Promise<void> {
  const started = Date.now();
  await interaction.deferReply();
  const roundtripMs = Date.now() - started;
  await interaction.editReply({
    embeds: [createPingEmbed({
      gatewayMs: Math.round(client.ws.ping),
      roundtripMs,
      uptimeSeconds: (Date.now() - startTime) / 1000,
    })],
  });
}

/**
 * /reset password is self-service: the member's own Discord ID is the only
 * account key the site is asked to reset, so nobody can reset someone else.
 */
async function sendPasswordReset(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const unavailable = (message: string) =>
    interaction.editReply({
      embeds: [makeEmbed("Password Reset Unavailable", message, "Password Reset Unavailable")],
    });

  if (!cyberGuardBaseUrl || !cyberGuardToken) {
    await unavailable("The CyberGuard Helper password service is not configured on this bot. Tell Guru_Guru1X.");
    return;
  }

  let response: Response;
  try {
    response = await requestJson(`${cyberGuardBaseUrl}/api/integration/password-reset`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cyberGuardToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ discordId: interaction.user.id }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    log("CyberGuard Helper password reset request failed", error);
    await unavailable("CyberGuard Helper could not be reached. Try again in a moment.");
    return;
  }

  const body = (await response.json().catch(() => null)) as {
    username?: string;
    password?: string;
    error?: string;
  } | null;
  if (!response.ok || !body?.password) {
    await unavailable(
      response.status === 404
        ? "No CyberGuard Helper account is linked to your Discord ID yet. Tell Guru_Guru1X so they can add it."
        : body?.error ?? "CyberGuard Helper could not reset your password. Try again later.",
    );
    return;
  }

  await interaction.editReply({
    embeds: [
      credentialEmbed({
        title: "CyberGuard Helper password reset",
        username: body.username ?? interaction.user.username,
        password: body.password,
        id: interaction.id,
        siteUrl: cyberGuardBaseUrl,
        nextStep:
          "Sign in with this default password. The site immediately asks you to choose your own, and any older sessions are already signed out.",
      }),
    ],
  });
}

function formatDataList(lines: string[], total: number): string {
  if (!lines.length) return NONE;
  // Pagination now carries long lists; keep a sane ceiling so one view cannot explode.
  const shown = lines.slice(0, 250);
  const omitted = Math.max(0, total - shown.length);
  return `${shown.join("\n")}${omitted ? `\n… and ${omitted} more` : ""}`;
}

function authorizedUserLines(): string[] {
  const rows = db.prepare("SELECT discord_user_id FROM authorized_users ORDER BY discord_user_id").all() as Array<{ discord_user_id: string }>;
  return rows.map(({ discord_user_id }) => {
    const user = client.users.cache.get(discord_user_id);
    return `${user?.tag ?? "Unknown user"} — ${discord_user_id}`;
  });
}

function authorizedRoleLines(): string[] {
  const rows = db.prepare("SELECT discord_role_id FROM authorized_roles ORDER BY discord_role_id").all() as Array<{ discord_role_id: string }>;
  const guilds = client.guilds.cache;
  return rows.map(({ discord_role_id }) => {
    const names = guilds
      .map((guild) => guild.roles.cache.get(discord_role_id)?.name)
      .filter((name): name is string => Boolean(name));
    const roleName = [...new Set(names)].join(", ").slice(0, 300) || "Unknown role";
    return `${roleName} — ${discord_role_id}`;
  });
}

export interface InfoSnapshot {
  pingMs: number;
  servers: number;
  totalUsers: number;
  uptimeSeconds: number;
  commandCount: number;
  authorizedUsers: number;
  authorizedRoles: number;
  botId: string;
  memoryMb: number;
  robloxOnline: boolean;
  robloxCloud: boolean;
  xtracker: boolean;
  robloxWatcher: boolean;
  exploitWatcher: boolean;
  /** Null for the owner, who is exempt from the daily command limit. */
  dailyUsage: DailyCommandUsage | null;
}

export function createInfoEmbed(info: InfoSnapshot): EmbedBuilder {
  return makeEmbed("Bot Information", commandDescriptions().join("\n"), "Info").addFields(
    { name: "Version", value: BOT_VERSION, inline: true },
    { name: "Ping", value: `${info.pingMs}ms`, inline: true },
    { name: "Servers", value: String(info.servers), inline: true },
    { name: "Total Users", value: info.totalUsers.toLocaleString("en-US"), inline: true },
    { name: "Uptime", value: formatUptime(info.uptimeSeconds), inline: true },
    {
      name: "Daily Commands",
      value: info.dailyUsage
        ? `${info.dailyUsage.used}/${info.dailyUsage.limit} used\n${info.dailyUsage.remaining} left ${discordTimestamp(info.dailyUsage.resetAt, "R")}`
        : "Unlimited (owner)",
      inline: true,
    },
    { name: "Slash Commands", value: String(info.commandCount), inline: true },
    { name: "Authorized Users", value: String(info.authorizedUsers), inline: true },
    { name: "Authorized Roles", value: String(info.authorizedRoles), inline: true },
    { name: "Bot ID", value: info.botId, inline: true },
    { name: "Platform", value: `${process.platform} ${process.arch}`, inline: true },
    { name: "Node.js", value: process.version, inline: true },
    { name: "discord.js", value: "v14", inline: true },
    { name: "Memory", value: `${info.memoryMb.toFixed(1)} MB`, inline: true },
    { name: "Roblox Public API", value: info.robloxOnline ? "OK" : "N/A", inline: true },
    { name: "Roblox Open Cloud Key", value: info.robloxCloud ? "OK" : "N/A", inline: true },
    { name: "[x]Tracker API", value: info.xtracker ? "OK" : "N/A", inline: true },
    { name: "Roblox Watcher API", value: info.robloxWatcher ? "OK" : "N/A", inline: true },
    { name: "Exploit Watcher API", value: info.exploitWatcher ? "OK" : "N/A", inline: true },
  );
}

client.on("interactionCreate", async (interaction) => {
  await runWithInteractionId(interaction.id, async () => {
    try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("pager:")) {
      const [, token, pageValue] = interaction.customId.split(":");
      const session = token ? paginationSessions.get(token) ?? restorePaginationSession(token) : undefined;
      if (!session || Date.now() - session.createdAt > PAGINATION_TTL_MS) {
        if (token) deletePaginationSession(token);
        await interaction.reply({ embeds: [makeEmbed("Pagination Expired", "This paginated result has expired. Run the command again.", "Warning")] });
        return;
      }
      const page = Number(pageValue);
      if (!Number.isInteger(page) || page < 0 || page >= session.pages.length) throw new BotError("Choose a valid page.");
      // The pages belong to the channel, not to whoever ran the command, so any
      // member may click them. If Discord refuses the in-place update, still
      // show the requested page to the clicker instead of an error.
      try {
        await interaction.update({
          embeds: [session.pages[page]!],
          components: [paginationRow(token!, page, session.pages.length) as PaginationRow, ...session.extraRows],
        });
      } catch (error) {
        log("Unable to update the paginated message", error);
        await interaction.followUp({ embeds: [session.pages[page]!], ephemeral: true }).catch(() => undefined);
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === "admin-authorized-user") {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ embeds: [deniedEmbed()] });
        return;
      }
      const userId = interaction.values[0];
      if (!userId || !isDiscordUserId(userId)) throw new BotError("Choose a valid authorized user.");
      const row = db.prepare(
        "SELECT discord_user_id, authorized_by, authorized_at FROM authorized_users WHERE discord_user_id = ?",
      ).get(userId) as { discord_user_id: string; authorized_by: string; authorized_at: string } | undefined;
      if (!row) throw new BotError("That user is no longer authorized.");
      const [user, authorizedBy] = await Promise.all([
        client.users.fetch(userId).catch(() => undefined),
        client.users.fetch(row.authorized_by).catch(() => undefined),
      ]);
      await interaction.reply({
        embeds: [createAuthorizedUserEmbed({
          userId,
          username: user?.username,
          displayName: user?.displayName,
          avatarUrl: user?.displayAvatarURL({ extension: "png", size: 256 }),
          authorizedAt: row.authorized_at,
          authorizedById: row.authorized_by,
          authorizedByName: authorizedBy?.username,
          daily: dailyCommandUsage(userId),
          perCommand: Object.keys(COMMAND_DAILY_LIMITS).map((name) => commandDailyUsage(userId, name)),
        })],
        // The client blocks mentions by default; allow just the viewed user.
        allowedMentions: { parse: [], users: [userId] },
      });
    } else if (interaction.isStringSelectMenu() && interaction.customId === "admin-panel") {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ embeds: [deniedEmbed()] });
        return;
      }
      const action = interaction.values[0];
      if (!action || !["authorize-user", "authorize-role", "deauthorize-user", "deauthorize-role", "customize", "status", "presence"].includes(action)) {
        throw new BotError("Choose a valid admin action.");
      }
      if (action === "status") {
        recordAdminChange(interaction, "No settings changed; opened the bot status selector.");
        await interaction.reply({
          embeds: [makeEmbed("Bot Status", "Choose the status the bot should show in Discord. Invisible keeps it connected but hides it from member lists.", "Info")],
          components: [createStatusMenu()],
        });
      } else if (action === "customize") {
        recordAdminChange(interaction, "No settings changed; opened the color target selector.");
        await interaction.reply({
          embeds: [makeEmbed("Change Embed Colors", "Choose the embed to recolor. Its current color is shown in the menu.", "Info")],
          components: [createColorTargetMenu()],
        });
      } else {
        recordAdminChange(interaction, `No settings changed; opened ${action}.`);
        await interaction.showModal(createAdminModal(action));
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === "admin-status") {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ embeds: [deniedEmbed()] });
        return;
      }
      const status = interaction.values[0];
      if (!status || !(PRESENCE_STATUSES as readonly string[]).includes(status)) throw new BotError("Choose a valid bot status.");
      const nextStatus = status as PresenceStatus;
      const previousStatus = getPresenceStatus();
      setSetting("bot_status", nextStatus);
      applyRotatingPresence();
      recordAdminChange(
        interaction,
        previousStatus === nextStatus
          ? `No status change; the bot is already ${PRESENCE_STATUS_LABELS[nextStatus]}.`
          : `Bot status changed from ${PRESENCE_STATUS_LABELS[previousStatus]} to ${PRESENCE_STATUS_LABELS[nextStatus]}.`,
      );
      await interaction.update({
        embeds: [makeEmbed("Bot Status Updated", `The bot is now **${PRESENCE_STATUS_LABELS[nextStatus]}**.`, "Success")],
        components: [],
      });
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("admin-color-target")) {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ embeds: [deniedEmbed()] });
        return;
      }
      const pageValue = interaction.customId.slice("admin-color-target".length);
      const page = pageValue ? Number(pageValue.slice(1)) : 0;
      if (!Number.isInteger(page) || page < 0) throw new BotError("Choose a valid embed color page.");
      const selected = interaction.values[0];
      if (selected === COLOR_TARGET_NEXT || selected === COLOR_TARGET_PREVIOUS) {
        const nextPage = page + (selected === COLOR_TARGET_NEXT ? 1 : -1);
        recordAdminChange(interaction, `No settings changed; opened color targets page ${nextPage + 1}.`);
        await interaction.update({
          embeds: [makeEmbed("Change Embed Colors", "Choose the individual embed to recolor. Its current color is shown in the menu.", "Info")],
          components: [createColorTargetMenu(nextPage)],
        });
        return;
      }
      const target = selected;
      if (!target || !COLOR_TARGETS.includes(target)) {
        throw new BotError("Choose a valid embed to recolor.");
      }
      recordAdminChange(interaction, `No settings changed; selected ${target} for recoloring.`);
      await interaction.reply({
        embeds: [makeEmbed("Choose Embed Color", `Choose a color for **${target}**.`, "Info")],
        components: [createColorMenu(target)],
      });
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("admin-color-value:")) {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ embeds: [deniedEmbed()] });
        return;
      }
      const target = interaction.customId.slice("admin-color-value:".length);
      const color = interaction.values[0];
      const setting = colorSetting(target);
      if (!setting || !color || !Object.hasOwn(CHART_COLORS, color)) {
        throw new BotError("Choose a valid embed and color.");
      }
      const currentColor = getSetting(setting.key, setting.fallback);
      const changes = currentColor === color ? [] : [`${target}: ${currentColor} -> ${color}`];
      setSetting(setting.key, color);
      recordAdminChange(
        interaction,
        changes.length ? changes.join("\n") : `No color change; ${target} is already ${color}.`,
      );
      await interaction.update({
        embeds: [makeEmbed(
          "Embed Colors Updated",
          `Set **${target}** to **${color}**.`,
          "Success",
        )],
        components: [],
      });
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith("admin-panel:")) {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ embeds: [deniedEmbed()] });
        return;
      }
      const action = interaction.customId.slice("admin-panel:".length);
      if (action === "presence") {
        const activities = validatePresenceActivities(interaction.fields.getTextInputValue("activities"));
        const previousActivities = getPresenceActivities();
        setSetting("presence_rotation", activities.join("\n"));
        startRotatingPresence();
        recordAdminChange(
          interaction,
          previousActivities.join("\n") === activities.join("\n")
            ? "No presence change; the rotation is already set to these activities."
            : `Rotating presence changed from "${previousActivities.join(" | ") || DEFAULT_PRESENCE}" to "${activities.join(" | ")}"`,
        );
        await interaction.reply({
          embeds: [makeEmbed(
            "Rotating Presence Updated",
            `Saved ${activities.length} rotating presence ${activities.length === 1 ? "activity" : "activities"}.`,
            "Success",
          )],
        });
        return;
      }
      const match = /^(authorize|deauthorize)-(user|role)$/.exec(action);
      if (!match) throw new BotError("Choose a valid admin action.");
      const operation = match[1]!;
      const type = match[2]!;
      const id = validateDiscordId(interaction.fields.getTextInputValue("discord_id"));
      if (operation === "deauthorize" && type === "user" && id === OWNER_ID) {
        throw new BotError("You cannot deauthorize the bot owner.");
      }
      const table = type === "role" ? "authorized_roles" : "authorized_users";
      const changed = operation === "authorize" ? addAuthorization(table, id) : removeAuthorization(table, id);
      recordAdminChange(
        interaction,
        changed
          ? `${operation === "authorize" ? "Authorized" : "Deauthorized"} ${type} ${id}.`
          : `No change; ${type} ${id} ${operation === "authorize" ? "was already authorized" : "was not authorized"}.`,
      );
      const result = operation === "authorize"
        ? changed ? "is now authorized." : "was already authorized."
        : changed ? "has been deauthorized." : "was not authorized.";
      const target = authorizationTargetLabel(type as "user" | "role", id);
      await interaction.reply({
        embeds: [makeEmbed(
          "Authorization Updated",
          `${target} ${result} Check \`/admin\` to confirm the grant.`,
          "Success",
        )],
      });
    }
  } catch (error) {
    log("Interaction handler failed", error);
    const message = errorText(error, "Something went wrong.");
    if (interaction.isRepliable()) {
      const payload = { embeds: [makeEmbed("Command Error", message.slice(0, 1500), "Error")] };
      if (interaction.deferred && !interaction.replied) await interaction.editReply(payload).catch(() => undefined);
      else if (interaction.replied) await interaction.followUp(payload).catch(() => undefined);
      else await interaction.reply(payload).catch(() => undefined);
    }
  } finally {
    void logInteractionAttempt(interaction).catch((error) => log("Unable to send interaction attempt to the logs channel", error));
    }
  });
});

client.once("clientReady", async () => {
  if (!client.user) return;
  log(`Connected to Discord as ${client.user.tag} (SergeantGuruV2 v${BOT_VERSION})`);
  log(`Authorization database: ${AUTH_DB_PATH}`);
  startRotatingPresence();
  try {
    await new REST({ version: "10" }).setToken(token!).put(Routes.applicationCommands(client.user.id), { body: commands.map((command) => command.toJSON()) });
    log(`Synced ${commands.length} Discord slash commands`);
  } catch (error) {
    log("Unable to synchronize slash commands", error);
  }

  if (cyberGuardBaseUrl && cyberGuardToken) {
    stopCredentialDelivery = startCredentialDelivery(client, {
      baseUrl: cyberGuardBaseUrl,
      token: cyberGuardToken,
      log,
    });
    log("Watching CyberGuard Helper for password deliveries");
  } else {
    log("CYBERGUARD_BASE_URL or CYBERGUARD_INTEGRATION_TOKEN is missing; password delivery is off");
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}; shutting down`);
  stopCredentialDelivery?.();
  client.destroy();
  db.close();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
const cleanupTimer = setInterval(() => {
  void cleanupCache().catch((error) => log("Cache cleanup failed", error));
  db.prepare("DELETE FROM daily_command_usage WHERE usage_day < ?").run(utcDay(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)));
  db.prepare("DELETE FROM command_daily_usage WHERE usage_day < ?").run(utcDay(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)));
  const cooldownCutoff = Date.now() - COMMAND_COOLDOWN_MS;
  for (const [id, at] of lastCommandAt) {
    if (at <= cooldownCutoff) lastCommandAt.delete(id);
  }
  const paginationCutoff = Date.now() - PAGINATION_TTL_MS;
  for (const [token, session] of paginationSessions) {
    if (session.createdAt < paginationCutoff) paginationSessions.delete(token);
  }
  db.prepare("DELETE FROM pagination_sessions WHERE created_at < ?").run(paginationCutoff);
}, 60 * 60 * 1000);
cleanupTimer.unref();
await mkdir(DATA_DIR, { recursive: true });
await cleanupCache();
if (process.env["NODE_ENV"] !== "test") await client.login(token);
