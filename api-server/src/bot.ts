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
import { discordTimestamp, fetchRobloxAvatar, formatChartCount, makeBadgeChart, summarizeBadgeHistory } from "./badge-chart";
import {
  calculateGrade,
  calculateHostingGrade,
  capitalizeGradeAbbreviations,
  correctGradeMistakeGrammar,
  formatGradeFeedback,
  gradePassThreshold,
  gradingAbbreviations,
  normalizeGradeText,
  type GradeAssessment,
  type GradeSeverity,
} from "./bot-grade";
import { reviewGradeSubmission, suggestNewGradeMistakes } from "./bot-grade-ai";
import { assessAltRisk } from "./bot-alt-ai";
import { createGradeRules, fetchGradeSheetRules, gradeSheetSeverityOverrides, mistakeMatchesSheetRule } from "./grade-sheet";
import packageJson from "../../package.json";

export { formatChartCount, makeBadgeChart };
export const BOT_VERSION: string = packageJson.version;
export { parseGradeMistakeSuggestions, parseGradeReview } from "./bot-grade-ai";
export { parseAltAssessment } from "./bot-alt-ai";

const OWNER_ID = "1186370477606838375";
const ROBLOX_CLOUD = "https://apis.roblox.com/cloud/v2";
const ROBLOX_USERS = "https://users.roblox.com/v1";
const ROBLOX_GROUPS = "https://groups.roblox.com/v2/users";
const ROBLOX_FRIENDS = "https://friends.roblox.com/v1/users";
const ROBLOX_GAMES = "https://games.roblox.com/v2/users";
const ROBLOX_AVATAR = "https://avatar.roblox.com/v1/users";
const TRELLO_API = "https://api.trello.com/1";
const XTRACKER_API = "https://api.xtracker.xyz";
const BLACKLIST_BOARD = "gsCa53Bt";
const SECRET_SERVICE_BOARD = "xgGFFrH3";
const NONE = "None";
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
const gradingAiBaseUrl = process.env["OLLAMA_BASE_URL"]?.trim() || "http://127.0.0.1:11434";
const gradingAiModel = process.env["OLLAMA_MODEL"]?.trim() || "qwen2.5:0.5b";

const BACKGROUND_CHECK_LOG_GUILD_ID = "1566264464062414881";
const BACKGROUND_CHECK_LOG_CHANNEL_ID = "1566264530361655387";
export const GRADING_FEEDBACK_CHANNEL_ID = "1569796036556234752";

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
const EMBED_ROLES: Record<string, [string, string]> = {
  "Background Check": ["embed_color_background_check", "Blurple"],
  "Badge Count": ["embed_color_badge_count", "Yellow"],
  "CBRN Groups": ["embed_color_groups", "Blue"],
  "Records": ["embed_color_records", "Purple"],
  "Bot Interaction": ["embed_color_interaction_log", "Blurple"],
  "AI Grading Rule Candidates - Review Before Adding": ["embed_color_grade_suggestions", "Blurple"],
  "Access Denied": ["embed_color_access_denied", "Red"],
  "Admin Panel": ["embed_color_admin_panel", "Blurple"],
  "Change Embed Colors": ["embed_color_admin_color_menu", "Blurple"],
  "Choose Embed Color": ["embed_color_admin_choose_color", "Blurple"],
  "Rate Limit Exceeded": ["embed_color_rate_limit", "Orange"],
  "Daily Limit Reached": ["embed_color_daily_limit", "Orange"],
  "Invalid Roblox Username": ["embed_color_invalid_username", "Orange"],
  "Invalid Background Query": ["embed_color_background_query_invalid", "Orange"],
  "Background Check Timed Out": ["embed_color_background_timeout", "Orange"],
  "Could Not Look Up User": ["embed_color_lookup_error", "Orange"],
  "Could Not Load Groups": ["embed_color_groups_error", "Orange"],
  "Could Not Load Records": ["embed_color_records_error", "Orange"],
  "Badge Count Timed Out": ["embed_color_badge_timeout", "Orange"],
  "Could Not Load Badge Count": ["embed_color_badge_error", "Orange"],
  "Server Required": ["embed_color_server_required", "Orange"],
  "Create Grade Report": ["embed_color_grade_setup", "Blurple"],
  "Bot Information": ["embed_color_bot_information", "Blurple"],
  "Change Log": ["embed_color_changelog", "Blue"],
  "Change Log Unavailable": ["embed_color_changelog_error", "Orange"],
  "API Status": ["embed_color_api_status", "Blue"],
  "Invalid Search Query": ["embed_color_search_invalid", "Orange"],
  "No Interactions Found": ["embed_color_search_empty", "Orange"],
  "Interaction Search Results": ["embed_color_search_results", "Green"],
  "Bot Data": ["embed_color_bot_data", "Blurple"],
  "Badge Tracking Expired": ["embed_color_badge_tracking_expired", "Orange"],
  "Advanced Badge Tracking": ["embed_color_badge_tracking", "Blurple"],
  "Embed Colors Updated": ["embed_color_admin_color_result", "Green"],
  "Invalid Evaluation Type": ["embed_color_invalid_evaluation", "Orange"],
  "Rotating Presence Updated": ["embed_color_presence_result", "Green"],
  "Authorization Updated": ["embed_color_authorization_result", "Green"],
  "Invalid Feedback": ["embed_color_feedback_invalid", "Orange"],
  "Grading Feedback Saved": ["embed_color_feedback_saved", "Green"],
  "Missing Usernames": ["embed_color_missing_usernames", "Orange"],
  "Grading Rules Unavailable": ["embed_color_grade_rules_error", "Red"],
  "Report Too Long": ["embed_color_grade_report_too_long", "Orange"],
  "VIP Training Grade Report": ["embed_color_grade_vip", "Green"],
  "Guarding Evaluation Grade Report": ["embed_color_grade_guarding", "Green"],
  "Hosting Evaluation Grade Report": ["embed_color_grade_hosting", "Green"],
  "Role Not Found": ["embed_color_role_not_found", "Orange"],
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
  CREATE TABLE IF NOT EXISTS daily_command_usage (
    discord_user_id TEXT NOT NULL,
    usage_day TEXT NOT NULL,
    command_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (discord_user_id, usage_day)
  );
  CREATE TABLE IF NOT EXISTS grade_feedback (
    normalized_mistake TEXT PRIMARY KEY,
    severity TEXT NOT NULL CHECK (severity IN ('MINOR', 'MODERATE', 'MAJOR', 'EXTREME')),
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  INSERT OR IGNORE INTO authorized_users (discord_user_id, authorized_by)
  VALUES ('${OWNER_ID}', '${OWNER_ID}');
`);

// Older databases only allowed MINOR, MODERATE, and MAJOR feedback overrides.
const gradeFeedbackSchema = (db.prepare(
  "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'grade_feedback'",
).get() as { sql?: string } | undefined)?.sql ?? "";
if (gradeFeedbackSchema && !gradeFeedbackSchema.includes("'EXTREME'")) {
  db.exec(`
    ALTER TABLE grade_feedback RENAME TO grade_feedback_legacy;
    CREATE TABLE grade_feedback (
      normalized_mistake TEXT PRIMARY KEY,
      severity TEXT NOT NULL CHECK (severity IN ('MINOR', 'MODERATE', 'MAJOR', 'EXTREME')),
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO grade_feedback (normalized_mistake, severity, updated_by, updated_at)
    SELECT normalized_mistake, severity, updated_by, updated_at FROM grade_feedback_legacy;
    DROP TABLE grade_feedback_legacy;
  `);
}

type JsonObject = Record<string, any>;
type BadgeDate = Date;
class BotError extends Error {}
class PrivateInventoryError extends BotError {}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  allowedMentions: { parse: [] },
});
const userRequests = new Map<string, number[]>();
const badgeTrackingByMessage = new Map<string, { requesterId: string; text: string }>();
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

export interface GradingFeedbackLogEntry {
  mistake: string;
  severity: GradeSeverity;
  userId: string;
  username?: string;
}

export function createGradingFeedbackLogEmbed({
  mistake,
  severity,
  userId,
  username,
}: GradingFeedbackLogEntry): EmbedBuilder {
  const sheetMistake = capitalizeGradeAbbreviations(
    mistake.replaceAll("`", "'").replace(/\s+/g, " ").trim(),
  );
  const embed = makeEmbed(
    "Grading Feedback Saved",
    "New grading feedback saved. Paste the row below into the Google Sheet.",
    "Success",
  );
  embed.addFields(
    { name: "Severity", value: severity, inline: true },
    { name: "Submitted by", value: username ? `${username} (<@${userId}>)` : `<@${userId}>`, inline: true },
    { name: "Google Sheets entry", value: `\`\`\`\n[-] ${sheetMistake} - ${severity}\n\`\`\`` },
  );
  embed.setTimestamp(new Date());
  return embed;
}

async function sendGradingFeedbackLog(embed: EmbedBuilder, userId: string): Promise<void> {
  if (!client.isReady()) throw new Error("Discord client is not ready to send a grading feedback log.");
  const channel = await client.channels.fetch(GRADING_FEEDBACK_CHANNEL_ID);
  if (!channel || !("send" in channel)) {
    throw new Error(`Grading feedback channel ${GRADING_FEEDBACK_CHANNEL_ID} was not available.`);
  }
  // Keep the owner ping in message content because mentions inside embeds do not notify.
  // Logs are never paginated, so the whole entry stays in one embed.
  await channel.send({ content: `<@${userId}>`, embeds: [embed], allowedMentions: { users: [userId] } });
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
  const interactionId = interactionContext.getStore();
  return `SergeantGuruV2 | ${new Date().toISOString().slice(11, 16)}Z | ID: ${interactionId ?? "N/A"}`;
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
    if (oldest) paginationSessions.delete(oldest);
  }
  paginationSessions.set(token, { pages: titledPages, createdAt: Date.now(), extraRows });
  return {
    embeds: [titledPages[0]!],
    components: [paginationRow(token, 0, titledPages.length) as PaginationRow, ...extraRows],
  };
}

function makeEmbed(title: string, description: string, _colorRole: string): EmbedBuilder {
  let titleRole = EMBED_TITLE_ROLES[title];
  if (!titleRole && title.endsWith(" Grade Report")) {
    titleRole = `${title.slice(0, -" Grade Report".length)} Grade Report`;
  }
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

function addAuthorization(table: "authorized_users" | "authorized_roles", id: string): boolean {
  const column = table === "authorized_users" ? "discord_user_id" : "discord_role_id";
  const result = db.prepare(`INSERT OR IGNORE INTO ${table} (${column}, authorized_by) VALUES (?, ?)`).run(id, OWNER_ID);
  return result.changes > 0;
}

function removeAuthorization(table: "authorized_users" | "authorized_roles", id: string): boolean {
  const column = table === "authorized_users" ? "discord_user_id" : "discord_role_id";
  return db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(id).changes > 0;
}

function createAdminPanelEmbed(): EmbedBuilder {
  const users = db.prepare("SELECT discord_user_id FROM authorized_users ORDER BY discord_user_id").all() as Array<{ discord_user_id: string }>;
  const roles = db.prepare("SELECT discord_role_id FROM authorized_roles ORDER BY discord_role_id").all() as Array<{ discord_role_id: string }>;
  const embed = makeEmbed("Admin Panel", "This panel is public. Only the bot owner can make changes.", "Info");
  embed.addFields(
    { name: "Authorized users", value: String(users.length), inline: true },
    { name: "Authorized roles", value: String(roles.length), inline: true },
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
      { label: "Change rotating presence", value: "presence", description: "Edit the bot's rotating status messages." },
    );
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
  client.user.setActivity(activities[presenceIndex % activities.length]!, { type: ActivityType.Playing });
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
  assetTypeCount: number | null;
  gamepassCount: number | null;
  private: boolean;
}

const INVENTORY_PAGE_LIMIT = 10;
const GAMEPASS_PAGE_LIMIT = 5;

async function fetchInventorySignals(userId: string, signal?: AbortSignal): Promise<InventorySignals> {
  try {
    return await cachedRoblox(`inventory_signals:${userId}`, 900, async () => {
      const result: InventorySignals = { itemCount: null, assetTypeCount: null, gamepassCount: null, private: false };
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
          if (response.status === 403) return { count, types: types.size, denied: true, available: false };
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
        return { count, types: types.size, denied: false, available };
      };

      const [inventory, gamepasses] = await Promise.allSettled([
        collect("", INVENTORY_PAGE_LIMIT),
        collect("gamePasses=true", GAMEPASS_PAGE_LIMIT),
      ]);
      if (inventory.status === "fulfilled") {
        if (inventory.value.denied) result.private = true;
        else if (inventory.value.available) {
          result.itemCount = inventory.value.count;
          result.assetTypeCount = inventory.value.types;
        }
      } else if (signal?.aborted) {
        throw inventory.reason;
      } else {
        log("Inventory items unavailable", inventory.reason);
      }
      if (gamepasses.status === "fulfilled") {
        if (gamepasses.value.denied) result.private = true;
        else if (gamepasses.value.available) result.gamepassCount = gamepasses.value.count;
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
    return { itemCount: null, assetTypeCount: null, gamepassCount: null, private: false };
  }
}

function formatGroups(groups: JsonObject[]): string {
  const names = groups.flatMap((data) => GROUP_IDS.has(Number(data.group?.id))
    ? [`• **${data.group?.name ?? ""}** — ${data.role?.name ?? "Member"}`]
    : []);
  return names.join("\n") || NONE;
}

export function createGroupsEmbed(username: string, groups: JsonObject[]): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`CBRN Groups — ${username}`)
    .setColor(embedColor("CBRN Groups"))
    .addFields({ name: "Ranks & Division", value: formatGroups(groups).slice(0, 1024) })
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

export function createRecordsEmbed(
  username: string,
  userId: string,
  blacklist: string,
  secret: string,
  external: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Records — ${username}`)
    .setURL(`https://www.roblox.com/users/${userId}/profile`)
    .setColor(embedColor("Records"))
    .addFields(
      { name: "Blacklist Record", value: blacklist.slice(0, 1024), inline: false },
      { name: "Secret Service Record", value: secret.slice(0, 1024), inline: false },
      { name: "[x]Tracker Records", value: external.slice(0, 1024), inline: false },
    )
    .setFooter({ text: footer() });
}

async function recordsReport(username: string, signal?: AbortSignal): Promise<EmbedBuilder> {
  const user = await resolveUser(username, signal);
  const [blacklistCards, secretCards, external] = await Promise.all([
    fetchTrelloCards(BLACKLIST_BOARD, user.name, signal),
    fetchTrelloCards(SECRET_SERVICE_BOARD, user.name, signal),
    fetchXtracker(user.id, signal),
  ]);
  if (signal?.aborted) throw signal.reason;
  return createRecordsEmbed(
    user.name,
    user.id,
    trelloText(blacklistCards, user.name, "blacklist"),
    trelloText(secretCards, user.name, "secret"),
    external,
  );
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
    if (response.status === 401) throw new BotError("The Roblox API key was rejected. The bot owner needs to update its secret.");
    if (response.status === 403) throw new PrivateInventoryError("This Roblox user's badge inventory is private or unavailable to the API key.");
    if (!response.ok) throw new BotError("Roblox could not load this user's badge history. Please try again later.");
    const payload = await response.json() as JsonObject;
    all.push(...(payload.inventoryItems ?? []));
    pageToken = String(payload.nextPageToken ?? "");
  } while (pageToken);
  return all;
}

function validateBadgeRate(userId: string): boolean {
  const now = Date.now();
  const recent = (userRequests.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 10) {
    userRequests.set(userId, recent);
    return false;
  }
  recent.push(now);
  userRequests.set(userId, recent);
  return true;
}

function formatRiskBand(score: number): string {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  if (score >= 15) return "Low";
  return "Minimal";
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

async function backgroundCheck(username: string, signal: AbortSignal = new AbortController().signal): Promise<{ embed: EmbedBuilder; badgeTracking: string; image?: AttachmentBuilder }> {
  const user = await resolveUser(username, signal);
  const [groups, details, history, friends, blacklistCards, secretCards, xtracker, avatarSignals, gameSignals, inventorySignals] = await Promise.all([
    fetchGroups(user.id, signal), fetchProfileDetails(user.id, signal), fetchUsernameHistory(user.id, signal), fetchFriendCounts(user.id, signal),
    fetchTrelloCards(BLACKLIST_BOARD, user.name, signal), fetchTrelloCards(SECRET_SERVICE_BOARD, user.name, signal), fetchXtracker(user.id, signal),
    fetchAvatarSignals(user.id, signal), fetchGameSignals(user.id, signal), fetchInventorySignals(user.id, signal),
  ]);
  const blacklist = trelloText(blacklistCards, user.name, "blacklist");
  const secret = trelloText(secretCards, user.name, "secret");
  if (signal.aborted) throw signal.reason;
  let badges: JsonObject[] = [];
  let image: Buffer | undefined;
  let inventoryPrivate = false;
  let badgeDataAvailable = false;
  try {
    const response = await requestJson(`${ROBLOX_CLOUD}/users/${user.id}/inventory-items?filter=badges%3Dtrue&maxPageSize=1`, { headers: { "x-api-key": robloxApiKey! }, signal }, true);
    if (response.status === 401) throw new BotError("The Roblox API key was rejected. The bot owner needs to update its secret.");
    if (response.status === 403) throw new PrivateInventoryError("Private inventory.");
    if (!response.ok) throw new BotError("Roblox could not check this user's badge inventory.");
    badges = await fetchBadges(user.id, signal);
    badgeDataAvailable = true;
    const chartColor = CHART_COLORS[getSetting("chart_color", DEFAULT_CHART_COLOR)]?.[0] ?? CHART_COLORS[DEFAULT_CHART_COLOR]![0];
    let avatar: Awaited<ReturnType<typeof fetchRobloxAvatar>> | undefined;
    try {
      avatar = await fetchRobloxAvatar(user.id, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      log("Roblox avatar unavailable", error);
    }
    if (signal.aborted) throw signal.reason;
    image = await makeBadgeChart(user.name, badges, chartColor, detailsCreated(details), avatar, user.id);
    if (signal.aborted) throw signal.reason;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof PrivateInventoryError) inventoryPrivate = true;
    else log("Badge chart is unavailable", error);
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
    aiAssessment = await assessAltRisk({
      baseUrl: gradingAiBaseUrl,
      model: gradingAiModel,
      signal,
      signals: {
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
  } catch (error) {
    if (signal.aborted) throw error;
    log("Local alt-risk AI assessment unavailable; using the rule-based score only.", error);
  }
  const risk = blendAltRisk(ruleRisk, aiAssessment?.chance);
  if (aiAssessment && !risk.usedAi) {
    log(`Ignored local alt-risk AI estimate of ${aiAssessment.chance}% because it deviated from the rule-based ${ruleRisk}% by more than ${ALT_AI_MAX_DEVIATION} points.`);
  }
  const aiNote = risk.usedAi ? aiAssessment?.reason ?? "" : "";
  const band = formatRiskBand(risk.score);
  const badgeSummary = summarizeBadgeHistory(badges);
  const badgeActivity = badgeSummary
    ? [
        `**${badges.length.toLocaleString("en-US")} badges**`,
        `• First earned ${discordTimestamp(badgeSummary.firstEarned)} (${discordTimestamp(badgeSummary.firstEarned, "R")})`,
        `• Latest earned ${discordTimestamp(badgeSummary.latestEarned)} (${discordTimestamp(badgeSummary.latestEarned, "R")})`,
        `• Average **${badgeSummary.averagePerYear.toFixed(1)}** per year over ${badgeSummary.totalYears}y`,
        `• Peak year **${badgeSummary.peakYear}** · ${badgeSummary.peakYearBadges} badges · Active years **${badgeSummary.activeYears} of ${badgeSummary.totalYears}**`,
        `• Last 30 days **${badgeSummary.last30Days}** · Last 12 months **${badgeSummary.last12Months}**`,
        `• Busiest day ${discordTimestamp(badgeSummary.busiestDay)} · ${badgeSummary.busiestDayCount} badges`,
        `• Longest quiet stretch **${badgeSummary.longestQuietMonths} months** · Months with no badges **${badgeSummary.monthsWithoutBadgesPercent}%**`,
      ].join("\n")
    : inventoryPrivate ? "Badge inventory is private or unavailable to the API key." : "No badge history is available.";
  const embed = new EmbedBuilder()
    .setTitle(user.name)
    .setURL(`https://www.roblox.com/users/${user.id}/profile`)
    .setColor(embedColor("Background Check"));
  if (inventoryPrivate) embed.setDescription("Badge inventory is set to private. Cannot draw badge history.");
  embed.addFields(
    { name: "Past Usernames", value: history.length ? history.map((name) => `• ${name}`).join("\n").slice(0, 1024) : NONE, inline: false },
    { name: "Account Created", value: created ? `${discordTimestamp(created)} (${discordTimestamp(created, "R")})` : "Unknown", inline: true },
    { name: "Alt Risk", value: [
        `**${risk.score}%** — ${band}`,
        aiNote ? `AI observation: ${aiNote}` : "",
        "Blended from rule-based signals and a local AI estimate. The rule score weighs every available signal: account age, badges, friends, followers, following, past usernames, groups and division ranks, avatar items, inventory items, game passes, created games, favourite games and record checks. Keep in mind a user may appear legitimate even if they are an alt, so be cautious and do not rely on it entirely.",
      ].filter(Boolean).join("\n").slice(0, 1024), inline: false },
    { name: "Friends", value: friends.friends === null ? NONE : friends.friends.toLocaleString("en-US"), inline: true },
    { name: "Following", value: friends.following === null ? NONE : friends.following.toLocaleString("en-US"), inline: true },
    { name: "Followers", value: friends.followers === null ? NONE : friends.followers.toLocaleString("en-US"), inline: true },
    { name: "Inventory", value: `[Click Here](https://www.roblox.com/users/${user.id}/inventory/)`, inline: false },
    { name: "Ranks & Division", value: formatGroups(groups).slice(0, 1024), inline: false },
    { name: "Blacklist Record", value: blacklist.slice(0, 1024), inline: false },
    { name: "Secret Service Record", value: secret.slice(0, 1024), inline: false },
    { name: "External Records", value: xtracker.slice(0, 1024), inline: false },
  ).setFooter({ text: footer() });
  if (image) embed.setImage("attachment://badge-history.png");
  return {
    embed,
    badgeTracking: badgeActivity,
    ...(image ? { image: new AttachmentBuilder(image, { name: "badge-history.png" }) } : {}),
  };
}

async function badgeCountReport(username: string, signal: AbortSignal): Promise<{ embed: EmbedBuilder; image?: AttachmentBuilder }> {
  const user = await resolveUser(username, signal);
  const [details, badges] = await Promise.all([
    fetchProfileDetails(user.id, signal),
    fetchBadges(user.id, signal),
  ]);
  if (signal.aborted) throw signal.reason;
  const created = detailsCreated(details);
  const summary = summarizeBadgeHistory(badges);
  const profile = `https://www.roblox.com/users/${user.id}/profile`;
  const embed = new EmbedBuilder()
    .setTitle(user.name)
    .setURL(profile)
    .setColor(embedColor("Badge Count"))
    .setFooter({ text: footer() });

  if (!summary) {
    embed.addFields({ name: "Advanced Badge Tracking", value: "No badge award history is available for this account." });
    return { embed };
  }

  let avatar: Awaited<ReturnType<typeof fetchRobloxAvatar>> | undefined;
  try {
    avatar = await fetchRobloxAvatar(user.id, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    log("Roblox avatar unavailable", error);
  }
  if (signal.aborted) throw signal.reason;
  const chartColor = CHART_COLORS[getSetting("chart_color", DEFAULT_CHART_COLOR)]?.[0] ?? CHART_COLORS[DEFAULT_CHART_COLOR]![0];
  const chart = await makeBadgeChart(user.name, badges, chartColor, created, avatar, user.id);
  embed.addFields({
    name: "Advanced Badge Tracking",
    value: [
      `**Total badges:** ${badges.length.toLocaleString("en-US")}`,
      `**First earned:** ${discordTimestamp(summary.firstEarned)} (${discordTimestamp(summary.firstEarned, "R")})`,
      `**Latest earned:** ${discordTimestamp(summary.latestEarned)} (${discordTimestamp(summary.latestEarned, "R")})`,
      `**Average:** ${summary.averagePerYear.toFixed(1)} badges per year across ${summary.totalYears} calendar years`,
      `**Peak year:** ${summary.peakYear} (${summary.peakYearBadges.toLocaleString("en-US")} badges)`,
      `**Activity:** ${summary.activeYears} active years of ${summary.totalYears}`,
      `**Recent awards:** ${summary.last30Days} in the last 30 days, ${summary.last12Months} in the last 12 months`,
      `**Busiest day:** ${discordTimestamp(summary.busiestDay)} (${summary.busiestDayCount.toLocaleString("en-US")} badges)`,
      `**Longest quiet period:** ${summary.longestQuietMonths} months`,
      `**Months without awards:** ${summary.monthsWithoutBadgesPercent}%`,
    ].join("\n").slice(0, 1024),
  });
  embed.setImage("attachment://badge-history.png");
  return { embed, image: new AttachmentBuilder(chart, { name: "badge-history.png" }) };
}

function isOwner(userId: string): boolean {
  return userId === OWNER_ID;
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
  "records",
  "grade",
  "api",
  "info",
  "changelog",
  "data",
  "search",
]);

// Authorized users get 50 access-controlled commands per UTC day; the owner is exempt.
export const DAILY_COMMAND_LIMIT = 50;

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
    if (interaction.customId === "advanced-badge-tracking") {
      const tracking = badgeTrackingByMessage.get(interaction.message.id);
      access = !tracking
        ? "expired"
        : tracking.requesterId === interaction.user.id && isInteractionAuthorized(interaction) ? "allowed" : "denied";
    } else if (isGradeFeedbackId(interaction.customId)) {
      access = isInteractionAuthorized(interaction) ? "allowed" : "denied";
    }
  } else if (interaction.isStringSelectMenu()) {
    action = `select:${interaction.customId}${interaction.values.length ? `:${interaction.values.join(",")}` : ""}`;
    if (interaction.customId === "admin-panel") access = isOwner(interaction.user.id) ? "allowed" : "denied";
    else if (interaction.customId === "data-view") access = isInteractionAuthorized(interaction) ? "allowed" : "denied";
    else if (interaction.customId.startsWith("admin-color-target") || interaction.customId.startsWith("admin-color-value:")) {
      access = isOwner(interaction.user.id) ? "allowed" : "denied";
    }
    else if (interaction.customId.startsWith("grade-event:")) {
      access = interaction.customId.slice("grade-event:".length) === interaction.user.id
        && isInteractionAuthorized(interaction) ? "allowed" : "denied";
    }
  } else if (interaction.isModalSubmit()) {
    action = `modal:${interaction.customId}`;
    if (interaction.customId.startsWith("admin-panel:")) access = isOwner(interaction.user.id) ? "allowed" : "denied";
    else if (isGradeFeedbackId(interaction.customId)) access = isInteractionAuthorized(interaction) ? "allowed" : "denied";
    else if (interaction.customId.startsWith("grade-report:")) {
      access = interaction.customId.split(":")[2] === interaction.user.id
        && isInteractionAuthorized(interaction) ? "allowed" : "denied";
    }
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

const GRADE_EVENT_TYPES = ["VIP Training", "Guarding Evaluation", "Hosting Evaluation"] as const;
type GradeEventType = typeof GRADE_EVENT_TYPES[number];
const HOST_RATING_EVENT_TYPE = "Host Rating";
const HOST_RATING_PASS_SCORE = 70;
const HOST_POSITIVE_ANSI = "\u001b[38;2;64;222;64m";
const HOST_NEGATIVE_ANSI = "\u001b[38;2;255;36;36m";

function isGradeEventType(value: string | undefined): value is GradeEventType {
  return GRADE_EVENT_TYPES.some((eventType) => eventType === value);
}

function isGradeFeedbackId(customId: string): boolean {
  return customId === "grade-feedback" || customId.startsWith("grade-feedback:");
}

function gradeFeedbackEventType(customId: string): string {
  return customId.startsWith("grade-feedback:") ? customId.slice("grade-feedback:".length) : "";
}

function gradeFeedbackSeverities(eventType: string): GradeSeverity[] {
  return eventType === "Hosting Evaluation" || eventType === HOST_RATING_EVENT_TYPE
    ? ["MINOR", "MODERATE", "MAJOR"]
    : ["MINOR", "MODERATE", "MAJOR", "EXTREME"];
}

interface AssessedGrade {
  assessment: GradeAssessment;
  abbreviations: Set<string>;
  grammarOverrides: Record<string, string>;
}

async function assessGrade(eventType: GradeEventType, mistakesText: string): Promise<AssessedGrade> {
  const sheetRules = await fetchGradeSheetRules();
  const raw = createGradeRules(sheetRules);
  const abbreviations = gradingAbbreviations(sheetRules.map(({ mistake }) => mistake));
  const savedOverrides = db.prepare("SELECT normalized_mistake, severity FROM grade_feedback").all() as Array<{ normalized_mistake: string; severity: string }>;
  const humanOverrideKeys = new Set(savedOverrides.map(({ normalized_mistake }) => normalized_mistake));
  const severityOverrides = Object.fromEntries(
    savedOverrides.filter((item): item is { normalized_mistake: string; severity: GradeSeverity } =>
      ["MINOR", "MODERATE", "MAJOR", "EXTREME"].includes(item.severity),
    ).map((item) => [item.normalized_mistake, item.severity]),
  );
  Object.assign(severityOverrides, gradeSheetSeverityOverrides(sheetRules, eventType));

  // The local model only fills gaps the deterministic matcher cannot resolve, and its
  // rubric matches are verified against the sheet before they can affect the grade.
  const grammarOverrides: Record<string, string> = {};
  try {
    const reviews = await reviewGradeSubmission({
      eventType,
      mistakesText,
      sheetRules,
      baseUrl: gradingAiBaseUrl,
      model: gradingAiModel,
    });
    for (const review of reviews) {
      const normalized = normalizeGradeText(review.original);
      if (review.correctedText) grammarOverrides[normalized] = correctGradeMistakeGrammar(review.correctedText, abbreviations);
      if (humanOverrideKeys.has(normalized)) continue;
      if (mistakeMatchesSheetRule(review.original, sheetRules, eventType)) continue;
      severityOverrides[normalized] = review.severity;
    }
  } catch (error) {
    log("Local grading AI review unavailable; using deterministic grading.", error);
  }

  const assessment = eventType === "Hosting Evaluation"
    ? calculateHostingGrade(mistakesText, raw, severityOverrides, grammarOverrides, abbreviations)
    : calculateGrade(mistakesText, raw, severityOverrides, eventType, grammarOverrides, abbreviations);
  return { assessment, abbreviations, grammarOverrides };
}

async function gradeReport(eventType: GradeEventType, evaluator: string, trainee: string, mistakesText: string): Promise<string> {
  const { assessment } = await assessGrade(eventType, mistakesText);
  const result = assessment.score >= gradePassThreshold(eventType) && !assessment.autoFail
    ? "PASS"
    : "FAIL";
  const lines = [
    `\`USERNAME:\` ${evaluator}`,
    `\`EVENT TYPE:\` **${eventType.toUpperCase()}**`,
    `\`${eventType === "Hosting Evaluation" ? "HOST" : eventType === "Guarding Evaluation" ? "INDUCTEE'S USERNAME" : "ATTENDEE'S USERNAME"}:\` ${trainee}`,
    "`FEEDBACK:`",
    ...formatGradeFeedback(assessment.classified),
    "",
    `\`GRADE:\` ${assessment.score}%`,
    `\`PASS/FAIL:\` **${result}**`,
  ];
  if (eventType === "Guarding Evaluation") lines.push(`\`PING:\` ${result === "FAIL" ? "@Chief Training Manager" : "N/A"}`);
  return lines.join("\n");
}

function hostRatingLines(text: string, limit = 40): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\[\+\]|\[-\]|[-+•])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function formatHostFeedbackBlock(
  lines: string[],
  prefix: "[+]" | "[-]",
  color: string,
  abbreviations: Iterable<string>,
  grammarOverrides: Record<string, string>,
): string[] {
  const block = ["```ansi"];
  const entries = lines
    .map((line) => line.replace(/^\s*(?:\[\+\]|\[-\]|[-+•])\s*/, "").trim())
    .filter(Boolean);
  if (!entries.length) {
    block.push("(none recorded)");
  } else {
    block.push(color);
    for (const line of entries) {
      const normalized = normalizeGradeText(line);
      const corrected = grammarOverrides[normalized] ?? correctGradeMistakeGrammar(line, abbreviations);
      const safe = corrected
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/`{3,}/g, "'''");
      block.push(`${prefix} ${safe}`);
    }
    block[block.length - 1] += "\u001b[0m";
  }
  block.push("```");
  return block;
}

function formatHostEventType(eventType: string, abbreviations: Iterable<string>): string {
  const cleaned = eventType.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Unspecified";
  return capitalizeGradeAbbreviations(cleaned, abbreviations)
    .split(" ")
    .map((word) => word ? word[0]!.toUpperCase() + word.slice(1) : word)
    .join(" ");
}

export interface HostRatingReportInput {
  evaluator: string;
  host: string;
  eventType: string;
  positives: string[];
  negatives: string[];
  score: number;
  passed: boolean;
  abbreviations?: Iterable<string>;
  grammarOverrides?: Record<string, string>;
}

export function formatHostRatingReport({
  evaluator,
  host,
  eventType,
  positives,
  negatives,
  score,
  passed,
  abbreviations = gradingAbbreviations(),
  grammarOverrides = {},
}: HostRatingReportInput): string {
  const ratingValue = score / 10;
  const rating = Number.isInteger(ratingValue) ? String(ratingValue) : ratingValue.toFixed(1);
  return [
    `**Your Username:** ${evaluator}`,
    `**Host's Username:** ${host}`,
    `**Event Type:** ${formatHostEventType(eventType, abbreviations)}`,
    `**Rating: ${rating}/10 | ${passed ? "PASS" : "FAIL"}**`,
    "**Positives:**",
    ...formatHostFeedbackBlock(positives, "[+]", HOST_POSITIVE_ANSI, abbreviations, grammarOverrides),
    "**Negatives:**",
    ...formatHostFeedbackBlock(negatives, "[-]", HOST_NEGATIVE_ANSI, abbreviations, grammarOverrides),
    "**Proof: **",
  ].join("\n");
}

async function gradeHostRating(
  evaluator: string,
  host: string,
  eventType: string,
  positivesText: string,
  negativesText: string,
): Promise<string> {
  const positives = hostRatingLines(positivesText);
  const negatives = hostRatingLines(negativesText);
  // Hosts are graded against the hosting rubric; positives are context and proof
  // of good performance, while negatives drive the numeric rating.
  const { assessment, abbreviations, grammarOverrides } = await assessGrade("Hosting Evaluation", negatives.join("\n"));
  const passed = assessment.score >= HOST_RATING_PASS_SCORE && !assessment.autoFail;
  return formatHostRatingReport({
    evaluator,
    host,
    eventType,
    positives,
    negatives,
    score: assessment.score,
    passed,
    abbreviations,
    grammarOverrides,
  });
}

async function reviewAndLogNewGradeMistakes(
  eventType: GradeEventType,
  mistakesText: string,
  userId: string,
): Promise<void> {
  const mistakes = mistakesText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\[-\]|\[\+\]|[-+•])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 40);
  if (!mistakes.length) return;

  const sheetRules = await fetchGradeSheetRules();
  const savedCorrections = db.prepare("SELECT normalized_mistake FROM grade_feedback").all() as Array<{ normalized_mistake: string }>;
  const suggestions = await suggestNewGradeMistakes({
    eventType,
    mistakes,
    knownRules: [...sheetRules.map(({ mistake }) => mistake), ...savedCorrections.map(({ normalized_mistake }) => normalized_mistake)],
    baseUrl: gradingAiBaseUrl,
    model: gradingAiModel,
  });
  if (!suggestions.length) return;

  const embed = new EmbedBuilder()
    .setTitle("AI Grading Rule Candidates - Review Before Adding")
    .setDescription(`The local **${gradingAiModel}** model found possible new rubric entries from a ${eventType} report. These are suggestions only and do not affect grades. Review severity and wording before adding them to the rubric.`)
    .setColor(embedColor("AI Grading Rule Candidates - Review Before Adding"))
    .addFields(
      { name: "Evaluation", value: eventType, inline: true },
      { name: "Submitted by", value: `<@${userId}> (${userId})`, inline: true },
      ...suggestions.map((suggestion, index) => ({
        name: `Suggestion ${index + 1} - ${suggestion.severity}`,
        value: [
          "Google Sheets entry (copy):",
          "```",
          `[-] ${suggestion.mistake} - ${suggestion.severity}`,
          "```",
          suggestion.reason ? `Why it may be new: ${suggestion.reason}` : "",
        ].filter(Boolean).join("\n").slice(0, 1024),
        inline: false,
      })),
    )
    .setFooter({ text: footer() })
    .setTimestamp(new Date());
  await sendLogEmbed(embed);
}

async function replyDenied(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ embeds: [deniedEmbed("Ask the bot owner to grant access.")] });
}

interface BackgroundCheckRequest {
  username?: string | null;
}

async function sendBackgroundCheck(interaction: ChatInputCommandInteraction, request: BackgroundCheckRequest): Promise<void> {
  if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
  if (!validateBadgeRate(interaction.user.id)) {
    await interaction.reply({ embeds: [makeEmbed("Rate Limit Exceeded", "You've reached the rate limit. Please wait before trying again. (0 requests remaining in the next minute)", "Warning")] });
    return;
  }
  const usernameInput = request.username?.trim() ?? "";
  if (!usernameInput) {
    await interaction.reply({ embeds: [makeEmbed("Invalid Background Query", "Provide a Roblox username.", "Warning")] });
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
        return { kind: "ready" as const, result: await backgroundCheck(normalized, controller.signal) };
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
    const advancedButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("advanced-badge-tracking")
        .setLabel("Advanced Badge Tracking")
        .setStyle(ButtonStyle.Secondary),
    );
    const message = await interaction.editReply({
      embeds: [outcome.result.embed],
      files: outcome.result.image ? [outcome.result.image] : [],
      components: [advancedButton],
    });
    if (badgeTrackingByMessage.size >= 500) {
      const oldestMessageId = badgeTrackingByMessage.keys().next().value;
      if (oldestMessageId) badgeTrackingByMessage.delete(oldestMessageId);
    }
    badgeTrackingByMessage.set(message.id, {
      requesterId: interaction.user.id,
      text: outcome.result.badgeTracking,
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
  if (!validateBadgeRate(interaction.user.id)) {
    await interaction.reply({ embeds: [makeEmbed("Rate Limit Exceeded", "You've reached the rate limit. Please wait before trying again.", "Warning")] });
    return;
  }
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
  if (!validateBadgeRate(interaction.user.id)) {
    await interaction.reply({ embeds: [makeEmbed("Rate Limit Exceeded", "You've reached the rate limit. Please wait before trying again.", "Warning")] });
    return;
  }
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

async function sendRecords(interaction: ChatInputCommandInteraction, username: string): Promise<void> {
  if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
  if (!validateBadgeRate(interaction.user.id)) {
    await interaction.reply({ embeds: [makeEmbed("Rate Limit Exceeded", "You've reached the rate limit. Please wait before trying again.", "Warning")] });
    return;
  }
  let normalized: string;
  try { normalized = validateRobloxUsername(username); }
  catch (error) { await interaction.reply({ embeds: [makeEmbed("Invalid Roblox Username", errorText(error, "Enter a valid Roblox username."), "Warning")] }); return; }
  await interaction.deferReply();
  try {
    await interaction.editReply({ embeds: [await recordsReport(normalized)] });
  } catch (error) {
    log("Records lookup failed", error);
    await interaction.editReply({ embeds: [makeEmbed("Could Not Load Records", errorText(error, "Something went wrong while loading this user's records. Please try again."), "Warning")] });
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
  embed.addFields(entries.flatMap(changelogEntryFields));
  return embed;
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
      .setDescription("Build a full badge-history report for a Roblox user.")
      .addStringOption((option) => option
        .setName("username")
        .setDescription("The Roblox username to check")
        .setRequired(true))),
  new SlashCommandBuilder()
    .setName("badge")
    .setDescription("Show a Roblox user's badge history.")
    .addSubcommand((sub) => sub
      .setName("count")
      .setDescription("Show badge totals, chart, and advanced tracking.")
      .addStringOption((option) => option
        .setName("username")
        .setDescription("The Roblox username to check")
        .setRequired(true))),
  new SlashCommandBuilder().setName("grade").setDescription("Create an evaluation or Host Rating report."),
  new SlashCommandBuilder().setName("api").setDescription("Check every connected API and service status."),
  new SlashCommandBuilder()
    .setName("groups")
    .setDescription("Check a user's CBRN groups and ranks.")
    .addStringOption((option) => option
      .setName("username")
      .setDescription("The Roblox username to check")
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName("records")
    .setDescription("Look up blacklist, Secret Service, and [x]Tracker records.")
    .addStringOption((option) => option
      .setName("username")
      .setDescription("The Roblox username to check")
      .setRequired(true)),
  new SlashCommandBuilder().setName("info").setDescription("Show bot statistics, commands, and health."),
  new SlashCommandBuilder()
    .setName("changelog")
    .setDescription("Show recent releases and changes."),
  new SlashCommandBuilder().setName("data").setDescription("Show detailed stats, access, and settings."),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Find every logged interaction by username, user ID, or interaction ID.")
    .addStringOption((option) => option
      .setName("query")
      .setDescription("A Discord or Roblox username, Discord user ID, or interaction ID")
      .setRequired(true)),
  new SlashCommandBuilder().setName("admin").setDescription("Open the bot owner admin panel."),
].map(configureCommand);

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.commandName;
  if (ACCESS_CONTROLLED_COMMANDS.has(name) && !isCommandAuthorized(interaction)) {
    commandGateOutcomes.set(interaction, "denied");
    return replyDenied(interaction);
  }
  if (ACCESS_CONTROLLED_COMMANDS.has(name) && !isOwner(interaction.user.id)) {
    const usage = consumeDailyCommand(interaction.user.id);
    if (!usage.allowed) {
      commandGateOutcomes.set(interaction, "limited");
      await interaction.reply({ embeds: [createDailyLimitEmbed(usage)] });
      return;
    }
  }
  commandGateOutcomes.set(interaction, "allowed");
  if (name === "background" && interaction.options.getSubcommand() === "check") {
    return sendBackgroundCheck(interaction, {
      username: interaction.options.getString("username"),
    });
  }
  if (name === "badge" && interaction.options.getSubcommand() === "count") return sendBadgeCount(interaction, interaction.options.getString("username", true));
  if (name === "groups") return sendGroups(interaction, interaction.options.getString("username", true));
  if (name === "records") return sendRecords(interaction, interaction.options.getString("username", true));
  if (name === "api") return sendApiStatus(interaction);
  if (name === "changelog") {
    if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
    const pagination = buildPagination(await loadChangelogEmbed());
    await interaction.reply({ embeds: pagination.embeds, components: pagination.components });
    return;
  }
  if (name === "grade") {
    if (!isCommandAuthorized(interaction)) return replyDenied(interaction);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`grade-event:${interaction.user.id}`)
      .setPlaceholder("Choose an evaluation type")
      .addOptions(
        { label: "VIP Training", value: "VIP Training", description: "Evaluate a VIP training session." },
        { label: "Guarding Evaluation", value: "Guarding Evaluation", description: "Evaluate a guarding shift." },
        { label: "Hosting Evaluation", value: "Hosting Evaluation", description: "Evaluate an event host." },
        { label: "Host Rating", value: HOST_RATING_EVENT_TYPE, description: "Rate a host's event with positives, negatives, and a score out of 10." },
      );
    await interaction.reply({
      embeds: [makeEmbed("Create Grade Report", "Choose an evaluation type, then fill in the requested details.", "Info")],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
    return;
  }
  if (name === "admin") {
    await interaction.reply({
      embeds: [createAdminPanelEmbed()],
      components: [createAdminPanelMenu()],
    });
    return;
  }
  if (name === "info") {
    const stats = db.prepare("SELECT (SELECT COUNT(*) FROM authorized_users) AS users, (SELECT COUNT(*) FROM authorized_roles) AS roles").get() as JsonObject;
    let robloxOnline = false;
    try { robloxOnline = (await requestJson(`${ROBLOX_USERS}/users/1`)).ok; } catch {}
    const ollama = await checkOllama();
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
      ollama,
      dailyUsage: isOwner(interaction.user.id) ? null : dailyCommandUsage(interaction.user.id),
    }));
    await interaction.reply({ embeds: pagination.embeds, components: pagination.components });
    return;
  }
  if (name === "data") {
    const pagination = buildPagination(createDataEmbed("overview"), [createDataViewMenu("overview") as PaginationRow]);
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

function apiCheckSummary(check: ApiCheck): string {
  const detail = check.detail ? ` — ${check.detail}` : "";
  const latency = check.latencyMs !== undefined ? `\n${check.latencyMs}ms` : "";
  return `${check.state}${detail}${latency}`;
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

async function checkGradeSheet(): Promise<ApiCheck> {
  const start = Date.now();
  try {
    const rules = await fetchGradeSheetRules();
    return { name: "Google Sheets Rubric", state: "Online", detail: `${rules.length} rules`, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      name: "Google Sheets Rubric",
      state: "Offline",
      detail: error instanceof Error ? error.message.slice(0, 120) : "Could not load the CSV",
      latencyMs: Date.now() - start,
    };
  }
}

async function checkOllama(): Promise<ApiCheck> {
  const name = "Ollama (grading AI)";
  const start = Date.now();
  try {
    const response = await fetch(new URL("/api/tags", gradingAiBaseUrl), { signal: AbortSignal.timeout(API_CHECK_TIMEOUT_MS) });
    const latencyMs = Date.now() - start;
    if (!response.ok) return { name, state: "Degraded", detail: `HTTP ${response.status}`, latencyMs };
    const payload = await response.json() as { models?: Array<{ name?: string }> };
    const models = (payload.models ?? []).map((model) => model.name ?? "");
    const pulled = models.some((model) => model === gradingAiModel
      || model === `${gradingAiModel}:latest`
      || model.startsWith(`${gradingAiModel}:`));
    return {
      name,
      state: pulled ? "Online" : "Degraded",
      detail: pulled ? gradingAiModel : `${gradingAiModel} is not pulled`,
      latencyMs,
    };
  } catch (error) {
    return { name, state: "Offline", detail: errorDetail(error), latencyMs: Date.now() - start };
  }
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
    checkGradeSheet(),
    checkOllama(),
  ]);

  const pagination = buildPagination(createApiStatusEmbed(checks));
  await interaction.editReply({ embeds: pagination.embeds, components: pagination.components });
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

function formatDataList(lines: string[], total: number): string {
  if (!lines.length) return NONE;
  // Pagination now carries long lists; keep a sane ceiling so one view cannot explode.
  const shown = lines.slice(0, 250);
  const omitted = Math.max(0, total - shown.length);
  return `${shown.join("\n")}${omitted ? `\n… and ${omitted} more` : ""}`;
}

export type DataView = "overview" | "access" | "bot" | "colors";

export const DATA_VIEW_LABELS: Record<DataView, string> = {
  overview: "Overview",
  access: "Access & Statistics",
  bot: "Bot & API",
  colors: "Embed Colors",
};

const DATA_VIEW_DESCRIPTIONS: Record<DataView, string> = {
  overview: "High-level bot, server, and usage totals.",
  access: "Authorized users, roles, and command usage.",
  bot: "Bot build, API health, and Ollama status.",
  colors: "Current embed and chart color settings.",
};

export interface DataStatus {
  robloxApiOnline?: boolean;
  ollama?: ApiCheck;
}

export function createDataViewMenu(selected: DataView = "overview"): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("data-view")
    .setPlaceholder(`Viewing ${DATA_VIEW_LABELS[selected]}`)
    .addOptions((Object.keys(DATA_VIEW_LABELS) as DataView[]).map((view) => ({
      label: DATA_VIEW_LABELS[view],
      description: DATA_VIEW_DESCRIPTIONS[view],
      value: view,
      ...(view === selected ? { default: true } : {}),
    })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export async function collectDataStatus(): Promise<DataStatus> {
  let robloxApiOnline = false;
  try {
    robloxApiOnline = (await requestJson(`${ROBLOX_USERS}/users/1`)).ok;
  } catch (error) {
    log("Roblox API status check failed while building /data", error);
  }
  return { robloxApiOnline, ollama: await checkOllama() };
}

export function createDataEmbed(view: DataView = "overview", status: DataStatus = {}): EmbedBuilder {
  if (view === "access") return createDataAccessEmbed();
  if (view === "bot") return createDataBotEmbed(status);
  if (view === "colors") return createDataColorEmbed();
  return createDataOverviewEmbed();
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

function savedGradingCorrectionCount(): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM grade_feedback").get() as { count: number }).count;
}

function createDataOverviewEmbed(): EmbedBuilder {
  const users = authorizedUserLines();
  const roles = authorizedRoleLines();
  return makeEmbed(
    "Bot Data",
    [
      "Choose a view from the menu: **Access & Statistics**, **Bot & API**, or **Embed Colors**.",
      "",
      ...commands.map((command) => `• **/${command.name}** — ${command.description}`),
    ].join("\n"),
    "Info",
  ).addFields(
    { name: "Authorized Users", value: String(users.length), inline: true },
    { name: "Authorized Roles", value: String(roles.length), inline: true },
    { name: "Saved Grading Corrections", value: String(savedGradingCorrectionCount()), inline: true },
    { name: "Servers", value: String(client.guilds.cache.size), inline: true },
  );
}

function createDataAccessEmbed(): EmbedBuilder {
  const users = authorizedUserLines();
  const roles = authorizedRoleLines();
  return makeEmbed(
    "Bot Data",
    "Access is granted from `/admin`. Everyone listed here can run the access-controlled commands.",
    "Info",
  ).addFields(
    {
      name: "Access",
      value: [
        `Authorized users: ${users.length}`,
        `Authorized roles: ${roles.length}`,
        `Saved grading corrections: ${savedGradingCorrectionCount()}`,
        `Active badge results: ${badgeTrackingByMessage.size}`,
      ].join("\n"),
      inline: false,
    },
    { name: "Authorized Users", value: formatDataList(users, users.length) },
    { name: "Authorized Roles", value: formatDataList(roles, roles.length) },
  );
}

function createDataBotEmbed(status: DataStatus): EmbedBuilder {
  const guilds = client.guilds.cache;
  const memberCount = guilds.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0);
  const recentRequestCount = [...userRequests.values()]
    .reduce((sum, timestamps) => sum + timestamps.filter((timestamp) => timestamp > Date.now() - 60_000).length, 0);
  return makeEmbed("Bot Data", "Runtime, Discord gateway, and live integration status.", "Info").addFields(
    {
      name: "Runtime",
      value: [
        `Version: ${BOT_VERSION}`,
        `Uptime: ${formatUptime((Date.now() - startTime) / 1000)}`,
        `Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`,
        `Platform: ${process.platform} ${process.arch}`,
        `Node.js: ${process.version}`,
        "discord.js: v14",
      ].join("\n"),
      inline: true,
    },
    {
      name: "Discord",
      value: [
        `Ping: ${Math.round(client.ws.ping)} ms`,
        `Bot ID: ${client.user?.id ?? NONE}`,
        `Servers: ${guilds.size}`,
        `Total users: ${memberCount.toLocaleString("en-US")}`,
        `Slash commands: ${commands.length}`,
      ].join("\n"),
      inline: true,
    },
    {
      name: "Integrations",
      value: [
        `Roblox Public API: ${status.robloxApiOnline ? "Online" : "Unavailable"}`,
        `Roblox Open Cloud: ${robloxApiKey ? "Configured" : "Not configured"}`,
        `[x]Tracker: ${xtrackerApiKey ? "Configured" : "Not configured"}`,
        `Ollama (grading AI): ${status.ollama ? apiCheckSummary(status.ollama) : "Not checked"}`,
        `Grading AI model: ${gradingAiModel}`,
      ].join("\n"),
      inline: true,
    },
    {
      name: "Activity",
      value: [
        `Requests (last minute): ${recentRequestCount}`,
        `Active badge results: ${badgeTrackingByMessage.size}`,
      ].join("\n"),
      inline: true,
    },
  );
}

function createDataColorEmbed(): EmbedBuilder {
  const colorLines = [
    `Badge Chart: ${getSetting("chart_color", DEFAULT_CHART_COLOR)}`,
    ...Object.entries(EMBED_ROLES).map(([role, [key, fallback]]) => `${role}: ${getSetting(key, fallback)}`),
  ];
  const colorFields = Array.from({ length: Math.ceil(colorLines.length / 12) }, (_, index) => ({
    name: index ? `Embed Colors (${index + 1})` : "Embed Colors",
    value: colorLines.slice(index * 12, (index + 1) * 12).join("\n"),
    inline: true,
  }));
  const activities = getPresenceActivities();
  return makeEmbed("Bot Data", "Change these from `/admin` → **Change colors**.", "Info").addFields(
    ...colorFields,
    { name: "Rotating Presence", value: formatDataList(activities, activities.length), inline: true },
  );
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
  ollama: ApiCheck;
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
    { name: "Ollama (grading AI)", value: apiCheckSummary(info.ollama), inline: true },
  );
}

client.on("interactionCreate", async (interaction) => {
  await runWithInteractionId(interaction.id, async () => {
    try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isButton() && interaction.customId === "advanced-badge-tracking") {
      const tracking = badgeTrackingByMessage.get(interaction.message.id);
      if (!tracking) {
        await interaction.reply({ embeds: [makeEmbed("Badge Tracking Expired", "This badge-tracking result has expired. Run the background check again.", "Warning")] });
        return;
      }
      if (!isInteractionAuthorized(interaction)) {
        await interaction.reply({ embeds: [deniedEmbed("Ask the bot owner to grant access.")] });
        return;
      }
      if (interaction.user.id !== tracking.requesterId) {
        await interaction.reply({ embeds: [deniedEmbed("Only the user who requested this background check can view its advanced badge tracking.")] });
        return;
      }
      const pagination = buildPagination(makeEmbed("Advanced Badge Tracking", tracking.text, "Info"));
      await interaction.reply({
        embeds: pagination.embeds,
        components: pagination.components,
      });
    } else if (interaction.isButton() && interaction.customId.startsWith("pager:")) {
      const [, token, pageValue] = interaction.customId.split(":");
      const session = token ? paginationSessions.get(token) : undefined;
      if (!session || Date.now() - session.createdAt > PAGINATION_TTL_MS) {
        if (token) paginationSessions.delete(token);
        await interaction.reply({ embeds: [makeEmbed("Pagination Expired", "This paginated result has expired. Run the command again.", "Warning")] });
        return;
      }
      const page = Number(pageValue);
      if (!Number.isInteger(page) || page < 0 || page >= session.pages.length) throw new BotError("Choose a valid page.");
      await interaction.update({
        embeds: [session.pages[page]!],
        components: [paginationRow(token!, page, session.pages.length) as PaginationRow, ...session.extraRows],
      });
    } else if (interaction.isButton() && isGradeFeedbackId(interaction.customId)) {
      if (!isInteractionAuthorized(interaction)) {
        await interaction.reply({ embeds: [deniedEmbed("Only authorized graders can submit grading feedback.")] });
        return;
      }
      const eventType = gradeFeedbackEventType(interaction.customId);
      const severities = gradeFeedbackSeverities(eventType);
      const modal = new ModalBuilder()
        .setCustomId(eventType ? `grade-feedback:${eventType}` : "grade-feedback")
        .setTitle("Grade Feedback");
      const mistake = new TextInputBuilder()
        .setCustomId("mistake")
        .setLabel("Mistake text to correct")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(300);
      const severity = new TextInputBuilder()
        .setCustomId("severity")
        .setLabel(`Severity: ${severities.join(", ")}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(8);
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(mistake),
        new ActionRowBuilder<TextInputBuilder>().addComponents(severity),
      );
      await interaction.showModal(modal);
    } else if (interaction.isStringSelectMenu() && interaction.customId === "admin-panel") {
      if (!isOwner(interaction.user.id)) {
        await interaction.reply({ embeds: [deniedEmbed()] });
        return;
      }
      const action = interaction.values[0];
      if (!action || !["authorize-user", "authorize-role", "deauthorize-user", "deauthorize-role", "customize", "presence"].includes(action)) {
        throw new BotError("Choose a valid admin action.");
      }
      if (action === "customize") {
        recordAdminChange(interaction, "No settings changed; opened the color target selector.");
        await interaction.reply({
          embeds: [makeEmbed("Change Embed Colors", "Choose the embed to recolor. Its current color is shown in the menu.", "Info")],
          components: [createColorTargetMenu()],
        });
      } else {
        recordAdminChange(interaction, `No settings changed; opened ${action}.`);
        await interaction.showModal(createAdminModal(action));
      }
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
    } else if (interaction.isStringSelectMenu() && interaction.customId === "data-view") {
      if (!isInteractionAuthorized(interaction)) {
        await interaction.reply({ embeds: [deniedEmbed("Ask the bot owner to grant access.")] });
        return;
      }
      const view = interaction.values[0];
      if (!view || !Object.hasOwn(DATA_VIEW_LABELS, view)) throw new BotError("Choose a valid data view.");
      const dataView = view as DataView;
      const status = dataView === "bot" ? await collectDataStatus() : {};
      const pagination = buildPagination(createDataEmbed(dataView, status), [createDataViewMenu(dataView) as PaginationRow]);
      await interaction.update({
        embeds: pagination.embeds,
        components: pagination.components,
      });
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("grade-event:")) {
      const ownerId = interaction.customId.slice("grade-event:".length);
      if (interaction.user.id !== ownerId || !isInteractionAuthorized(interaction)) {
        await interaction.reply({ embeds: [deniedEmbed("Only the authorized person who started `/grade` can choose its evaluation type.")] });
        return;
      }
      const eventType = interaction.values[0];
      const isHostRating = eventType === HOST_RATING_EVENT_TYPE;
      if (!isHostRating && !isGradeEventType(eventType)) {
        await interaction.reply({ embeds: [makeEmbed("Invalid Evaluation Type", "Choose a valid evaluation type.", "Warning")] });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`grade-report:${eventType}:${ownerId}`)
        .setTitle(isHostRating ? "Host Rating" : `${eventType} Grade`);
      const evaluatorRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("evaluator")
          .setLabel("Your Roblox username")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue("Guru_Guru1X")
          .setMaxLength(20),
      );
      if (isHostRating) {
        modal.addComponents(
          evaluatorRow,
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("host")
              .setLabel("Host's Roblox username")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(20),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("eventType")
              .setLabel("Event type")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
              .setPlaceholder("e.g. VIP Training"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("positives")
              .setLabel("Positives (one per line)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(2000)
              .setPlaceholder("[+] Enter each positive on a new line"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("negatives")
              .setLabel("Negatives (one per line)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(2000)
              .setPlaceholder("[-] Enter each negative on a new line"),
          ),
        );
      } else {
        const traineeLabel = eventType === "Guarding Evaluation"
          ? "Inductee's username"
          : eventType === "Hosting Evaluation" ? "Host's username" : "Attendee's username";
        modal.addComponents(
          evaluatorRow,
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("trainee")
              .setLabel(traineeLabel)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(20),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("mistakes")
              .setLabel("Mistakes (one per line)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(4000)
              .setPlaceholder("Enter each mistake on a new line"),
          ),
        );
      }
      await interaction.showModal(modal);
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
      await interaction.reply({
        embeds: [makeEmbed(
          "Authorization Updated",
          `Discord ${type} ${id} ${result} Run \`/admin\` to refresh the panel.`,
          "Success",
        )],
      });
    } else if (interaction.isModalSubmit() && isGradeFeedbackId(interaction.customId)) {
      if (!isInteractionAuthorized(interaction)) {
        await interaction.reply({ embeds: [deniedEmbed("Only authorized graders can submit grading feedback.")] });
        return;
      }
      const eventType = gradeFeedbackEventType(interaction.customId);
      const allowedSeverities = gradeFeedbackSeverities(eventType);
      const mistake = interaction.fields.getTextInputValue("mistake").trim();
      const normalizedMistake = normalizeGradeText(mistake);
      const severity = interaction.fields.getTextInputValue("severity").trim().toUpperCase();
      if (!normalizedMistake || !allowedSeverities.includes(severity as GradeSeverity)) {
        await interaction.reply({ embeds: [makeEmbed("Invalid Feedback", `Enter mistake text and a severity of ${allowedSeverities.join(", ")}.`, "Warning")] });
        return;
      }
      await interaction.deferReply();
      db.prepare(`
        INSERT INTO grade_feedback (normalized_mistake, severity, updated_by)
        VALUES (?, ?, ?)
        ON CONFLICT(normalized_mistake) DO UPDATE SET
          severity = excluded.severity, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
      `).run(normalizedMistake, severity, interaction.user.id);
      let logSent = true;
      try {
        await sendGradingFeedbackLog(createGradingFeedbackLogEmbed({
          mistake,
          severity: severity as GradeSeverity,
          userId: interaction.user.id,
          username: interaction.user.username,
        }), OWNER_ID);
      } catch (error) {
        logSent = false;
        log("Grading feedback could not be sent to the grading feedback channel", error);
      }
      await interaction.editReply({
        embeds: [makeEmbed(
          "Grading Feedback Saved",
          `Future matching feedback will be graded as **${severity}**. ${logSent ? `A sheet-ready copy was posted in <#${GRADING_FEEDBACK_CHANNEL_ID}>.` : "The feedback log could not be posted."}`,
          "Success",
        )],
      });
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith("grade-report:")) {
      const [, eventTypeValue, ownerId] = interaction.customId.split(":");
      if (interaction.user.id !== ownerId || !isInteractionAuthorized(interaction)) {
        await interaction.reply({ embeds: [deniedEmbed("Only the authorized person who started `/grade` can submit this report.")] });
        return;
      }
      const standardEventType = isGradeEventType(eventTypeValue) ? eventTypeValue : undefined;
      const isHostRating = eventTypeValue === HOST_RATING_EVENT_TYPE;
      if (!isHostRating && !standardEventType) {
        await interaction.reply({ embeds: [makeEmbed("Invalid Evaluation Type", "This evaluation type is invalid. Run `/grade` again.", "Warning")] });
        return;
      }

      const evaluator = interaction.fields.getTextInputValue("evaluator").trim();
      let trainee = "";
      let mistakesText = "";
      let host = "";
      let hostEventType = "";
      let positives = "";
      let negatives = "";
      if (isHostRating) {
        host = interaction.fields.getTextInputValue("host").trim();
        hostEventType = interaction.fields.getTextInputValue("eventType").trim();
        positives = interaction.fields.getTextInputValue("positives");
        negatives = interaction.fields.getTextInputValue("negatives");
        if (!evaluator || !host || !hostEventType) {
          await interaction.reply({ embeds: [makeEmbed("Missing Usernames", "Enter your username, the host's username, and the event type before submitting the report.", "Warning")] });
          return;
        }
        if (!positives.trim() && !negatives.trim()) {
          await interaction.reply({ embeds: [makeEmbed("Invalid Feedback", "Enter at least one positive or negative for the host rating.", "Warning")] });
          return;
        }
      } else {
        trainee = interaction.fields.getTextInputValue("trainee").trim();
        mistakesText = interaction.fields.getTextInputValue("mistakes");
        if (!evaluator || !trainee) {
          await interaction.reply({ embeds: [makeEmbed("Missing Usernames", "Enter both Roblox usernames before submitting the report.", "Warning")] });
          return;
        }
      }

      await interaction.deferReply();

      let report: string;
      try {
        report = isHostRating
          ? await gradeHostRating(evaluator, host, hostEventType, positives, negatives)
          : await gradeReport(standardEventType!, evaluator, trainee, mistakesText);
      } catch (error) {
        log("Grading rules could not be loaded", error);
        await interaction.editReply({
          embeds: [makeEmbed("Grading Rules Unavailable", "The grading rules could not be loaded. Please contact the bot owner.", "Error")],
        });
        return;
      }
      if (report.length > 2000) {
        await interaction.editReply({ embeds: [makeEmbed("Report Too Long", "This report is too long to send as one message. Shorten the feedback and try again.", "Warning")] });
        return;
      }

      const fail = report.includes("**FAIL**");
      const role = standardEventType === "Guarding Evaluation" && fail
        ? interaction.guild?.roles.cache.find((candidate) => candidate.name.toLowerCase() === "chief training manager")
        : undefined;
      const content = role ? report.replace("@Chief Training Manager", role.toString()) : report;
      await interaction.editReply({
        content,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`grade-feedback:${standardEventType ?? HOST_RATING_EVENT_TYPE}`)
            .setLabel("Feedback")
            .setStyle(ButtonStyle.Secondary),
        )],
        allowedMentions: role ? { roles: [role.id], users: [], parse: [] } : { parse: [] },
      });
      if (standardEventType === "Guarding Evaluation" && fail && !role && interaction.inGuild()) {
        await interaction.followUp({
          embeds: [makeEmbed("Role Not Found", "The report was posted, but this server has no `Chief Training Manager` role to mention.", "Warning")],
        });
      }
      void reviewAndLogNewGradeMistakes(
        standardEventType ?? "Hosting Evaluation",
        isHostRating ? negatives : mistakesText,
        interaction.user.id,
      ).catch((error) => log("Local grading AI suggestion review failed; the grade report was still sent.", error));
    }
  } catch (error) {
    log("Interaction handler failed", error);
    const message = errorText(error, "Something went wrong.");
    if (interaction.isRepliable()) {
      const payload = { embeds: [makeEmbed("Command Error", message.slice(0, 1500), "Error")] };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => undefined);
      else await interaction.reply(payload).catch(() => undefined);
    }
  } finally {
    void logInteractionAttempt(interaction).catch((error) => log("Unable to send interaction attempt to the logs channel", error));
    }
  });
});

client.once("ready", async () => {
  if (!client.user) return;
  log(`Connected to Discord as ${client.user.tag} (SergeantGuruV2 v${BOT_VERSION})`);
  startRotatingPresence();
  try {
    await new REST({ version: "10" }).setToken(token!).put(Routes.applicationCommands(client.user.id), { body: commands.map((command) => command.toJSON()) });
    log(`Synced ${commands.length} Discord slash commands`);
  } catch (error) {
    log("Unable to synchronize slash commands", error);
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}; shutting down`);
  client.destroy();
  db.close();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
const cleanupTimer = setInterval(() => {
  void cleanupCache().catch((error) => log("Cache cleanup failed", error));
  db.prepare("DELETE FROM daily_command_usage WHERE usage_day < ?").run(utcDay(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)));
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, times] of userRequests) {
    const remaining = times.filter((time) => time > cutoff);
    if (remaining.length) userRequests.set(id, remaining);
    else userRequests.delete(id);
  }
  const paginationCutoff = Date.now() - PAGINATION_TTL_MS;
  for (const [token, session] of paginationSessions) {
    if (session.createdAt < paginationCutoff) paginationSessions.delete(token);
  }
}, 60 * 60 * 1000);
cleanupTimer.unref();
await mkdir(DATA_DIR, { recursive: true });
await cleanupCache();
if (process.env["NODE_ENV"] !== "test") await client.login(token);
