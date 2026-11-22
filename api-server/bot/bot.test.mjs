import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ApplicationIntegrationType, EmbedBuilder, InteractionContextType } from "discord.js";

process.env["NODE_ENV"] = "test";
process.env["DISCORD_BOT_TOKEN"] = "test-token";
process.env["ROBLOX_OPEN_CLOUD_API_KEY"] = "test-key";
// Each test process gets its own database so parallel test files never lock the real one.
process.env["BOT_AUTH_DB_PATH"] = path.join(tmpdir(), `sgh-bot-test-${process.pid}.sqlite3`);

const {
  ACCESS_CONTROLLED_COMMANDS,
  BOT_VERSION,
  altRisk,
  blendAltRisk,
  commandDescriptions,
  commands,
  parseChangelog,
  createChangelogEmbed,
  loadChangelogEmbed,
  COLOR_TARGETS,
  COLOR_TARGET_PAGE_SIZE,
  createAdminModal,
  createAdminPanelMenu,
  createStatusMenu,
  createAuthorizedUsersMenu,
  createCooldownEmbed,
  sendAdminPanel,
  createApiStatusEmbed,
  createColorMenu,
  createColorTargetMenu,
  createAuthorizedUserEmbed,
  createInfoEmbed,
  formatExploitWatcher,
  formatLinkedDiscordAccounts,
  formatDiscordWatcherRecord,
  formatDiscordAccountSection,
  watcherGuildReasons,
  formatWatcherEvidence,
  createPingEmbed,
  createGroupsEmbed,
  createProfileLinkEmbed,
  createInteractionLogEmbed,
  createSearchResultEmbeds,
  buildPaginationFromPages,
  restorePaginationSession,
  isDiscordUserId,
  parseDiscordId,
  discordAltRisk,
  combinedAltRisk,
  DAILY_COMMAND_LIMIT,
  consumeDailyCommand,
  resetDailyCommandUsage,
  COMMAND_COOLDOWN_MS,
  COMMAND_DAILY_LIMITS,
  commandCooldownRemaining,
  recordCommandUse,
  resetCommandCooldown,
  commandDailyUsage,
  consumeCommandDailyUsage,
  resetCommandDailyUsage,
  PAGE_LINE_LIMIT,
  buildPagination,
  interactionLogLocations,
  makeBadgeChart,
  formatChartCount,
  matchesInteractionLog,
  paginateEmbed,
  runWithInteractionId,
} = await import("../dist/bot.mjs");
const { assessAltRisk, parseAltAssessment } = await import("../dist/bot-alt-ai.mjs");

test("registers only the retained commands", () => {
  const registered = commands.map((command) => command.toJSON());
  assert.deepEqual(
    registered.map(({ name }) => name),
    ["background", "badge", "api", "groups", "profile", "info", "changelog", "search", "ping", "admin"],
  );
  assert.equal(registered.some(({ name }) => name === "data"), false, "/data is removed");
  assert.equal(registered.some(({ name }) => name === "records"), false, "/records is removed");
  assert.equal(registered.find(({ name }) => name === "ping").options?.length ?? 0, 0);
  assert.equal(registered.find(({ name }) => name === "admin").options?.length ?? 0, 0);
  assert.equal(registered.find(({ name }) => name === "badge").options[0].name, "count");
  assert.equal(registered.find(({ name }) => name === "search").options[0].name, "query");
  assert.equal(registered.find(({ name }) => name === "changelog").options?.length ?? 0, 0);
  assert.match(registered.find(({ name }) => name === "search").description, /every logged interaction by username, user ID, or interaction ID/);
  const backgroundOptions = registered.find(({ name }) => name === "background").options[0].options;
  assert.equal(backgroundOptions[0].name, "username");
  assert.equal(backgroundOptions[1].name, "discord");
  assert.equal(backgroundOptions.find(({ name }) => name === "discord").required, true);
  assert.match(backgroundOptions.find(({ name }) => name === "discord").description, /Discord user ID/);
  assert.equal(backgroundOptions.find(({ name }) => name === "username").required, true);
  assert.match(backgroundOptions.find(({ name }) => name === "username").description, /Roblox username/);
  const profileOptions = registered.find(({ name }) => name === "profile").options;
  assert.equal(profileOptions[0].name, "username");
  assert.equal(profileOptions[0].required, true);
});

test("Discord watcher records appear only when flagged", () => {
  assert.equal(formatDiscordWatcherRecord("Roblox Watcher", { flagged: false, reasons: [] }), "");
  const flagged = formatDiscordWatcherRecord("Exploit Watcher", { flagged: true, reasons: ["Condo Hub (NSFW)"] });
  assert.match(flagged, /\*\*Exploit Watcher:\*\* 🔴 Flagged/);
  assert.match(flagged, /↳ Condo Hub \(NSFW\)/);
  assert.match(formatDiscordWatcherRecord("Roblox Watcher", { flagged: true, reasons: [] }), /↳ None/);
});

test("the Discord account section shows identity, mention, and Hammer Time creation", () => {
  const section = formatDiscordAccountSection("987654321098765432", {
    username: "guru",
    displayName: "Guru",
    createdAt: new Date("2020-01-02T03:04:05.000Z"),
  });
  assert.match(section, /## Discord Account\n<@987654321098765432>\n\*\*Username:\*\* guru/);
  assert.doesNotMatch(section, /ID Ping/);
  assert.match(section, /\*\*Display Name:\*\* Guru/);
  assert.match(section, /\*\*User ID:\*\* `987654321098765432`/);
  assert.match(section, /\*\*Account Created:\*\* <t:\d+:D> \(<t:\d+:R>\)/);
});

test("Discord IDs resolve raw IDs and mentions", () => {
  const discordId = "987654321098765432";
  assert.equal(parseDiscordId(discordId), discordId);
  assert.equal(parseDiscordId(`<@${discordId}>`), discordId);
  assert.equal(parseDiscordId(`<@!${discordId}>`), discordId);
  assert.equal(parseDiscordId("not-a-discord-id"), undefined);
});

test("Discord and combined alt risk increase with account age", () => {
  const now = Date.UTC(2026, 10, 22);
  assert.equal(discordAltRisk(new Date(now - 2 * 86_400_000), now).score, 85);
  assert.equal(discordAltRisk(new Date(now - 30 * 86_400_000), now).score, 40);
  assert.equal(discordAltRisk(new Date(now - 400 * 86_400_000), now).score, 12);
  assert.equal(discordAltRisk(undefined), undefined);
  assert.equal(combinedAltRisk(80, 5), 81);
  assert.equal(combinedAltRisk(16, undefined), 16);
});

test("/profile returns only the Roblox profile link", () => {
  const embed = createProfileLinkEmbed("Guru_Guru1X", "123456789").toJSON();
  assert.equal(embed.title, "Guru_Guru1X");
  assert.equal(embed.url, "https://www.roblox.com/users/123456789/profile");
  assert.equal(embed.description, "https://www.roblox.com/users/123456789/profile");
  assert.equal(embed.fields, undefined, "/profile must not add badges, groups, or records");
});

test("changelog parses newest-first releases, CRLF bullets, and ignores malformed sections", () => {
  assert.deepEqual(parseChangelog("# Change Log\r\n## 2.1.0 - 2026-11-13\r\n- Added command\r\n- Added colors\r\n## invalid\r\n- ignored\r\n## 2.0.0 - 2026-11-12\r\n- Initial release"), [
    { version: "2.1.0", date: "2026-11-13", descriptions: ["Added command", "Added colors"] },
    { version: "2.0.0", date: "2026-11-12", descriptions: ["Initial release"] },
  ]);
  assert.deepEqual(parseChangelog(""), []);
  assert.deepEqual(parseChangelog("## malformed\n- ignored"), []);
});

test("changelog shows all recent releases newest first without a version", () => {
  const markdown = "## 2.1.0 - 2026-11-13\n- New command\n- New colors\n## 2.0.0 - 2026-11-12\n- Initial release";
  const recent = createChangelogEmbed(markdown).toJSON();
  assert.equal(recent.title, "Change Log");
  assert.deepEqual(recent.fields.map(({ name }) => name), ["2.1.0 - 2026-11-13", "2.0.0 - 2026-11-12"]);
  assert.equal(recent.fields[0].value, "- New command\n- New colors");
  assert.equal(recent.fields[1].value, "- Initial release");
  assert.match(recent.footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: /);
  assert.equal(createChangelogEmbed("").toJSON().title, "Change Log Unavailable");
  const long = createChangelogEmbed(`## 2.0.0 - 2026-11-12\n- ${"x".repeat(7000)}`).toJSON();
  assert.ok(long.fields.every(({ value }) => value.length <= 1024), "release text must fit Discord field limits");
  assert.equal(long.fields.map(({ value }) => value).join("").length, 7002, "splitting must not drop changelog text");
  assert.ok(COLOR_TARGETS.includes("Change Log"));
  assert.ok(COLOR_TARGETS.includes("Change Log Unavailable"));
});

test("/changelog paginates releases instead of truncating them", () => {
  const releases = Array.from({ length: 20 }, (_, index) => `## 2.${index}.0 - 2026-11-01\n- Change ${index}`);
  const pages = paginateEmbed(createChangelogEmbed(releases.join("\n")));
  assert.ok(pages.length > 1, "multiple releases should span multiple pages");
  for (const page of pages) {
    assert.match(page.toJSON().footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: /, "every page keeps the universal footer");
  }
  const shown = pages.flatMap((page) => page.toJSON().fields.map(({ name, value }) => `${name}\n${value}`)).join("\n");
  for (let index = 0; index < 20; index += 1) {
    assert.match(shown, new RegExp(`2\\.${index}\\.0`));
    assert.match(shown, new RegExp(`Change ${index}`));
  }
});

test("changelog loads the repository release notes from the bundled runtime path", async () => {
  const embed = (await loadChangelogEmbed()).toJSON();
  assert.equal(embed.title, "Change Log");
  const text = embed.fields.map(({ name, value }) => `${name}\n${value}`).join("\n");
  assert.match(text, /2\.0\.0/);
  assert.doesNotMatch(text, /1\.[01]\.0/);
  assert.match(text, /changelog/);
});

test("all slash commands support guilds, DMs, and private channels", () => {
  const expectedContexts = [
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  ].sort((a, b) => a - b);
  const expectedInstallTypes = [
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  ].sort((a, b) => a - b);

  for (const command of commands.map((item) => item.toJSON())) {
    assert.deepEqual(
      [...(command.contexts ?? [])].sort((a, b) => a - b),
      expectedContexts,
      `${command.name} should support every context`,
    );
    assert.deepEqual(
      [...(command.integration_types ?? [])].sort((a, b) => a - b),
      expectedInstallTypes,
      `${command.name} should support guild and user installs`,
    );
  }
});

test("/info lists full command names including subcommands", () => {
  const lines = commandDescriptions();
  assert.ok(lines.some((line) => line.startsWith("• **/background check**")));
  assert.ok(lines.some((line) => line.startsWith("• **/badge count**")));
  assert.ok(lines.some((line) => line.startsWith("• **/groups**")));
  assert.ok(lines.some((line) => line.startsWith("• **/ping**")));
  assert.equal(lines.some((line) => line.includes("/data")), false);
  assert.equal(lines.some((line) => line.includes("/records")), false);
});

test("every slash command, subcommand, and option has a short description", () => {
  for (const command of commands.map((item) => item.toJSON())) {
    assert.ok(command.description?.trim(), `/${command.name} needs a description`);
    assert.ok(command.description.length <= 100, `/${command.name} description is too long for Discord`);
    for (const option of command.options ?? []) {
      assert.ok(option.description?.trim(), `/${command.name} ${option.name} needs a description`);
      assert.ok(option.description.length <= 100, `/${command.name} ${option.name} description is too long`);
      for (const nested of option.options ?? []) {
        assert.ok(nested.description?.trim(), `/${command.name} ${option.name} ${nested.name} needs a description`);
      }
    }
    for (const line of commandDescriptions().filter((item) => item.includes(`**/${command.name}`))) {
      assert.match(line, /^• \*\*\/[\w ]+\*\* — \S/, `"${line}" must include a description`);
    }
  }
});

test("admin menus describe every option", () => {
  for (const menu of [createAdminPanelMenu(), createAuthorizedUsersMenu()]) {
    const options = menu.toJSON().components[0].options;
    assert.ok(options.every((option) => option.label?.trim()), "every menu option needs a label");
    assert.ok(options.every((option) => !option.description || option.description.length <= 100));
  }
});

test("the admin panel can change the bot status", () => {
  const menu = createStatusMenu().toJSON().components[0];
  assert.equal(menu.custom_id, "admin-status");
  assert.deepEqual(menu.options.map(({ value }) => value), ["online", "idle", "dnd", "invisible"]);
  assert.ok(createAdminPanelMenu().toJSON().components[0].options.some(({ value }) => value === "status"));
});

test("/admin is limited to the bot owner", async () => {
  const denied = [];
  await sendAdminPanel({
    user: { id: "999999999999999999" },
    reply: async (payload) => { denied.push(payload); },
  });
  assert.equal(denied.length, 1);
  assert.equal(denied[0].embeds[0].toJSON().title, "Access Denied");
  assert.equal(denied[0].embeds[0].toJSON().fields.find(({ name }) => name === "Your Discord ID").value, "999999999999999999");
  assert.equal(denied[0].ephemeral, true, "access denials are private");
  assert.equal(denied[0].components, undefined, "non-owners must not receive the admin menu");

  const opened = [];
  await sendAdminPanel({
    user: { id: "1186370477606838375" },
    reply: async (payload) => { opened.push(payload); },
  });
  assert.equal(opened.length, 1);
  const embed = opened[0].embeds[0].toJSON();
  assert.equal(embed.title, "Admin Panel");
  assert.match(embed.description, /Only the bot owner/);
  assert.match(embed.fields.find(({ name }) => name.startsWith("Authorized users")).value, /1186370477606838375/);
  assert.ok(embed.fields.some(({ name }) => name.startsWith("Authorized roles")));
  assert.equal(opened[0].components.length, 2, "the owner receives the action and authorized-user menus");
  assert.equal(opened[0].components[1].toJSON().components[0].custom_id, "admin-authorized-user");
});

test("the authorized-user view shows identity, headshot, grant time, and grantor", () => {
  assert.ok(COLOR_TARGETS.includes("Authorized User"), "the view needs its own selectable embed color");
  const resetAt = new Date("2026-11-23T00:00:00Z");
  const embed = createAuthorizedUserEmbed({
    userId: "1154853004676178092",
    username: "helper",
    displayName: "Helper",
    avatarUrl: "https://cdn.discordapp.com/avatars/1154853004676178092/abc.png",
    authorizedAt: "2026-11-22 14:13:00",
    authorizedById: "1186370477606838375",
    authorizedByName: "guru_guru1x",
    daily: { allowed: true, used: 2, limit: DAILY_COMMAND_LIMIT, remaining: 8, resetAt },
    perCommand: [
      { command: "background", label: "/background check", allowed: true, used: 1, limit: 5, remaining: 4, resetAt },
      { command: "badge", label: "/badge count", allowed: true, used: 1, limit: 5, remaining: 4, resetAt },
    ],
  }).toJSON();
  const field = (name) => embed.fields.find((item) => item.name === name).value;

  assert.equal(embed.title, "Authorized User");
  assert.match(embed.description, /\*\*Helper\*\*/);
  assert.match(embed.description, /<@1154853004676178092>/);
  assert.equal(embed.thumbnail.url, "https://cdn.discordapp.com/avatars/1154853004676178092/abc.png");
  assert.match(field("Discord ID"), /1154853004676178092/);
  assert.match(field("Authorized"), /<t:\d+:F>/);
  assert.match(field("Authorized"), /<t:\d+:R>/);
  assert.match(field("Authorized By"), /guru_guru1x/);
  assert.match(field("Authorized By"), /1186370477606838375/);
  assert.match(field("Commands Today"), /^2\/10/);
  assert.match(field("Per-command Limits"), /\/badge count: 1\/5/);
  assert.match(embed.footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: /);

  const ownerRow = createAuthorizedUserEmbed({
    userId: "1186370477606838375",
    authorizedAt: "2026-11-22 14:13:00",
    authorizedById: "1186370477606838375",
    daily: { allowed: true, used: 0, limit: DAILY_COMMAND_LIMIT, remaining: DAILY_COMMAND_LIMIT, resetAt },
    perCommand: [],
  }).toJSON();
  assert.equal(ownerRow.fields.find(({ name }) => name === "Authorized By").value, "Self-authorized");
  assert.equal(ownerRow.thumbnail, undefined, "an unresolvable user still renders without a headshot");
});

test("/ping reports gateway latency, round trip, uptime, and version", () => {
  const embed = createPingEmbed({ gatewayMs: 42, roundtripMs: 7, uptimeSeconds: 3661 }).toJSON();
  assert.equal(embed.title, "Ping");
  assert.match(embed.description, /42ms/);
  assert.match(embed.description, /7ms/);
  assert.equal(embed.fields.find(({ name }) => name === "Uptime").value, "1h 1m 1s");
  assert.equal(embed.fields.find(({ name }) => name === "Version").value, BOT_VERSION);
  assert.match(embed.footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: /);
});

test("every command except the owner-only admin panel requires granted access", () => {
  const registered = commands.map((command) => command.toJSON().name);
  assert.deepEqual(
    registered.filter((name) => !ACCESS_CONTROLLED_COMMANDS.has(name)),
    ["ping", "admin"],
  );
  for (const name of ["background", "badge", "groups", "changelog", "info"]) {
    assert.ok(ACCESS_CONTROLLED_COMMANDS.has(name), `${name} must require access`);
  }
});

test("authorized users get exactly 10 commands per UTC day", () => {
  const userId = "999999999999999999";
  const firstDay = new Date("2099-01-01T12:00:00Z");
  resetDailyCommandUsage(userId);
  try {
    for (let used = 1; used <= DAILY_COMMAND_LIMIT; used += 1) {
      const usage = consumeDailyCommand(userId, firstDay);
      assert.equal(usage.allowed, true, `command ${used} should be allowed`);
      assert.equal(usage.used, used);
      assert.equal(usage.remaining, DAILY_COMMAND_LIMIT - used);
    }

    const blocked = consumeDailyCommand(userId, firstDay);
    assert.equal(blocked.allowed, false, "command 11 must be blocked");
    assert.equal(blocked.used, DAILY_COMMAND_LIMIT);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.resetAt.toISOString(), "2099-01-02T00:00:00.000Z");

    const nextDay = consumeDailyCommand(userId, new Date("2099-01-02T00:00:01Z"));
    assert.equal(nextDay.allowed, true, "the quota resets at UTC midnight");
    assert.equal(nextDay.used, 1);
    assert.equal(nextDay.remaining, DAILY_COMMAND_LIMIT - 1);
  } finally {
    resetDailyCommandUsage(userId);
  }
});

test("lookup commands have separate five-per-day budgets", () => {
  const userId = "999999999999999998";
  const day = new Date("2099-03-01T12:00:00Z");
  resetCommandDailyUsage(userId);
  try {
    for (let used = 1; used <= 5; used += 1) {
      const usage = consumeCommandDailyUsage(userId, "background", day);
      assert.equal(usage.allowed, true, `background use ${used} should be allowed`);
      assert.equal(usage.used, used);
      assert.equal(usage.limit, 5);
      assert.equal(usage.remaining, 5 - used);
    }
    const blocked = consumeCommandDailyUsage(userId, "background", day);
    assert.equal(blocked.allowed, false, "the sixth background check must be blocked");
    assert.equal(blocked.used, 5);
    assert.equal(blocked.remaining, 0);

    assert.equal(commandDailyUsage(userId, "badge", day).used, 0, "each command has its own budget");
    assert.equal(consumeCommandDailyUsage(userId, "groups", day).allowed, true);
    assert.deepEqual(Object.keys(COMMAND_DAILY_LIMITS).sort(), ["background", "badge", "groups"]);

    const nextDay = consumeCommandDailyUsage(userId, "background", new Date("2099-03-02T00:00:01Z"));
    assert.equal(nextDay.allowed, true, "the per-command quota resets at UTC midnight");
    assert.equal(nextDay.used, 1);
  } finally {
    resetCommandDailyUsage(userId);
  }
});

test("commands share a strict one-minute cooldown per user", () => {
  const userId = "999999999999999997";
  resetCommandCooldown(userId);
  try {
    assert.equal(COMMAND_COOLDOWN_MS, 60_000);
    assert.equal(commandCooldownRemaining(userId, 1_000_000), 0);
    recordCommandUse(userId, 1_000_000);
    assert.equal(commandCooldownRemaining(userId, 1_000_001), 59_999);
    assert.equal(commandCooldownRemaining(userId, 1_059_999), 1);
    assert.equal(commandCooldownRemaining(userId, 1_060_000), 0);
  } finally {
    resetCommandCooldown(userId);
  }
});

test("/info reports bot statistics and integrations", () => {
  const embed = createInfoEmbed({
    pingMs: 42,
    servers: 2,
    totalUsers: 120,
    uptimeSeconds: 3600,
    commandCount: commands.length,
    authorizedUsers: 3,
    authorizedRoles: 1,
    botId: "1186370477606838375",
    memoryMb: 128.4,
    robloxOnline: true,
    robloxCloud: true,
    xtracker: false,
    robloxWatcher: true,
    exploitWatcher: true,
    dailyUsage: {
      allowed: true,
      used: 7,
      limit: DAILY_COMMAND_LIMIT,
      remaining: DAILY_COMMAND_LIMIT - 7,
      resetAt: new Date("2026-11-14T00:00:00Z"),
    },
  }).toJSON();
  assert.match(embed.fields.find(({ name }) => name === "Daily Commands").value, /^7\/10 used/);
  assert.equal(embed.fields.find(({ name }) => name === "Version").value, BOT_VERSION);
  assert.equal(embed.fields.find(({ name }) => name === "Ping").value, "42ms");
  assert.equal(embed.fields.find(({ name }) => name === "Uptime").value, "1h 0s");
});

test("watcher accounts are listed once each as mentions", () => {
  const merged = formatLinkedDiscordAccounts([
    {
      watcher: "Roblox Watcher",
      product: "robloxwatcher",
      accounts: [
        { id: "1522651757115609140", sources: ["Bloxlink"], flagged: true },
        { id: "111111111111111111", sources: ["Discord Profile"], flagged: false },
      ],
    },
    {
      watcher: "Exploit Watcher",
      product: "exploitwatcher",
      accounts: [
        { id: "1522651757115609140", sources: ["Discord Profile"], flagged: false },
        { id: "1533296343572025416", sources: ["Bloxlink"], flagged: true },
      ],
    },
  ]);
  assert.equal(merged, "**Linked Discord accounts:** 3\n• <@1522651757115609140>\n• <@111111111111111111>\n• <@1533296343572025416>");
  assert.equal(merged.match(/1522651757115609140/g).length, 1);
  assert.doesNotMatch(merged, /Bloxlink|flagged/);
  assert.equal(formatLinkedDiscordAccounts([]), "");
});

test("watcher sections show the server evidence behind each flag", () => {
  const accounts = [{
    id: "1522651757115609140",
    sources: ["Bloxlink"],
    flagged: true,
    reasons: ["Xeno (Executor Reselling Server) · 80 messages · last seen <t:1770000000:R>"],
  }];
  const evidence = formatWatcherEvidence(accounts);
  assert.equal(evidence, "↳ <@1522651757115609140>\n  Xeno (Executor Reselling Server) · 80 messages · last seen <t:1770000000:R>");
  const header = formatLinkedDiscordAccounts([{ watcher: "Exploit Watcher", product: "exploitwatcher", accounts }]);
  assert.doesNotMatch(header, /↳/);
  assert.match(header, /• <@1522651757115609140>/);
});

test("watcher guild reasons describe server type, activity and recency", () => {
  const reasons = watcherGuildReasons({
    flagged: true,
    guilds: [
      { name: "Xeno", guildTypes: [{ name: "Executor Reselling Server" }], activity: { messages: 80, reactions: 2 }, lastSeen: "2026-02-03T04:05:06.000Z" },
      { name: "Water", guildTypes: [], activity: { messages: 2, reactions: 4 }, lastSeen: "2026-11-01T00:00:00.000Z" },
    ],
  });
  assert.match(reasons[0], /^Xeno \(Executor Reselling Server\) · 80 messages, 2 reactions, last seen <t:\d+:R>$/);
  assert.match(reasons[1], /^Water · 2 messages, 4 reactions, last seen <t:\d+:R>$/);
  assert.deepEqual(watcherGuildReasons({ flagged: true, guilds: [] }), ["flagged account; no server details were reported"]);
  assert.deepEqual(watcherGuildReasons({ flagged: false, guilds: [] }), []);
});

test("Exploit Watcher keeps linked accounts out of its own section", () => {
  const status = formatExploitWatcher({
    robloxId: "9876543210",
    flagged: false,
    totalInjections: 5,
    totalGamesInjected: 2,
    discordAccounts: [
      { id: "1522651757115609140", sources: ["Bloxlink"], flagged: true },
      { id: "1533296343572025416", sources: ["Discord Profile", "Bloxlink"], flagged: false },
    ],
    injectedGames: [
      { name: "Base Wars: The Land!", totalInjections: 3, lastInjection: "2026-07-01T17:00:00.000Z" },
      { name: "Roblox", totalInjections: 2, lastInjection: "2026-06-21T22:10:00.000Z" },
    ],
  });
  assert.match(status, /\u{1F534} \*\*Flagged\*\* — 5 injections in 2 games/u);
  assert.match(status, /Base Wars: The Land! — 3 \(last 2026-07-01\)/);
  assert.doesNotMatch(status, /Linked Discord accounts/);
});

test("Exploit Watcher flags an account whose linked Discord accounts are flagged", () => {
  assert.match(
    formatExploitWatcher({
      flagged: false,
      totalInjections: 0,
      discordAccounts: [{ id: "1522651757115609140", sources: ["Bloxlink"], flagged: true }],
      injectedGames: [],
    }),
    /\u{1F534} \*\*Flagged\*\* — 1 linked Discord account flagged/u,
  );
  assert.equal(
    formatExploitWatcher({ flagged: false, discordAccounts: [], injectedGames: [] }),
    "\u{1F7E2} **Not flagged** — no injections or flagged linked accounts were found",
  );
});

test("the admin panel lists authorized users in its own dropdown", () => {
  const menu = createAuthorizedUsersMenu().toJSON().components[0];
  assert.equal(menu.custom_id, "admin-authorized-user");
  assert.ok(menu.options.some(({ value }) => value === "1186370477606838375"));
});

test("the cooldown uses a live Discord countdown", () => {
  assert.match(createCooldownEmbed(30_000).toJSON().description, /<t:\d+:R>/);
});

test("admin modal and color menus provide selectable access and appearance settings", () => {
  const accessModal = createAdminModal("authorize-user").toJSON();
  const presenceModal = createAdminModal("presence").toJSON();
  const adminActions = createAdminPanelMenu().toJSON().components[0].options;
  const pageCount = Math.ceil(COLOR_TARGETS.length / COLOR_TARGET_PAGE_SIZE);
  const targetPages = Array.from({ length: pageCount }, (_, page) =>
    createColorTargetMenu(page).toJSON().components[0].options,
  );
  const targets = targetPages.flat().filter(({ value }) => !["__next__", "__previous__"].includes(value));
  const colors = createColorMenu("Background Check").toJSON().components[0].options;
  assert.equal(accessModal.components.length, 1);
  assert.ok(accessModal.components.every((row) => row.components[0].label.length <= 45));
  assert.deepEqual(targets.map(({ value }) => value), COLOR_TARGETS);
  assert.ok(!COLOR_TARGETS.includes("EVERY EMBED"));
  assert.ok(targetPages.every((options) => options.length <= 25));
  assert.ok(targetPages[0].some(({ value }) => value === "__next__"));
  assert.ok(targetPages[1].some(({ value }) => value === "__previous__"));
  assert.ok(targets.find(({ value }) => value === "Background Check").description.includes("Current color:"));
  for (const target of COLOR_TARGETS) {
    assert.ok(createColorMenu(target).toJSON().components[0].options.length > 0, `${target} should have a color menu`);
  }
  assert.deepEqual(colors.map(({ value }) => value), [
    "Blurple",
    "Purple",
    "Blue",
    "Green",
    "Red",
    "Orange",
    "Yellow",
    "Pink",
    "Teal",
  ]);
  assert.ok(colors.some(({ default: isDefault }) => isDefault));
  assert.equal(presenceModal.title, "Change Rotating Presence");
  assert.equal(presenceModal.components[0].components[0].custom_id, "activities");
  assert.match(presenceModal.components[0].components[0].value, /\n|SergeantGuruV2/);
  assert.ok(adminActions.some(({ value }) => value === "presence"));
});

test("interaction log embeds use the same fields for allowed and denied access", () => {
  const fields = {
    action: "/background check",
    user: "guru_guru1x",
    userId: "1186370477606838375",
    server: "[CBRN](https://discord.com/channels/1447012918590967880) (1447012918590967880)",
    channel: "[general](https://discord.com/channels/1447012918590967880/1483210528620019908) (1483210528620019908)",
    interactionId: "1569668990463385620",
    messageLink: "https://discord.com/channels/1447012918590967880/1483210528620019908/1569668990463385621",
  };
  const allowed = createInteractionLogEmbed({ ...fields, access: "allowed" }).toJSON();
  const denied = createInteractionLogEmbed({ ...fields, access: "denied" }).toJSON();
  const expectedFieldNames = [
    "Action",
    "Access",
    "User",
    "Username",
    "User ID",
    "Server",
    "Channel",
    "Interaction ID",
    "Message Link",
  ];

  assert.equal(allowed.title, "Bot Interaction");
  assert.equal(denied.title, allowed.title);
  assert.deepEqual(allowed.fields.map(({ name }) => name), expectedFieldNames);
  assert.deepEqual(denied.fields.map(({ name }) => name), expectedFieldNames);
  assert.equal(allowed.fields[1].value, "ALLOWED");
  assert.equal(denied.fields[1].value, "DENIED");
  assert.equal(allowed.fields[2].value, `<@${fields.userId}>`);
  assert.equal(allowed.fields[3].value, "guru_guru1x");
  assert.equal(allowed.fields[4].value, fields.userId);
  assert.match(allowed.fields[5].value, /discord\.com\/channels\/1447012918590967880/);
  assert.match(allowed.fields[6].value, /discord\.com\/channels\/1447012918590967880\/1483210528620019908/);
  assert.equal(allowed.fields[8].value, fields.messageLink);
  assert.ok(allowed.fields.every(({ inline }) => inline === true));
  assert.ok(denied.fields.every(({ inline }) => inline === true));
  assert.equal(allowed.fields.some(({ name }) => name === "Changed"), false);
  assert.match(allowed.footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: (?:N\/A|\d+)$/);
  const adminLog = createInteractionLogEmbed({
    ...fields,
    action: "/admin",
    access: "allowed",
    changed: "Background Check: Blurple -> Green",
  }).toJSON();
  assert.equal(adminLog.fields.at(-1).name, "Changed");
  assert.equal(adminLog.fields.at(-1).value, "Background Check: Blurple -> Green");
});

test("/search matches usernames, Discord user IDs, and interaction IDs", () => {
  const embed = createInteractionLogEmbed({
    action: "/background check",
    access: "allowed",
    user: "guru_guru1x",
    userId: "1186370477606838375",
    server: "1447012918590967880",
    channel: "1483210528620019908",
    interactionId: "1569668990463385620",
    messageLink: "https://discord.com/channels/1447012918590967880/1483210528620019908/1569668990463385621",
  }).toJSON();
  assert.equal(matchesInteractionLog(embed, "guru_guru1x"), true);
  assert.equal(matchesInteractionLog(embed, "GURU_GURU1X"), true);
  assert.equal(matchesInteractionLog(embed, "1186370477606838375"), true);
  assert.equal(matchesInteractionLog(embed, "1569668990463385620"), true);
  assert.equal(matchesInteractionLog(embed, "not-a-match"), false);
  assert.equal(matchesInteractionLog(embed, "156966899046338562"), false);
});

test("interaction ID is included in embed footers", () => {
  const interactionId = "1569668990463385620";
  const embed = runWithInteractionId(interactionId, () => createGroupsEmbed("Guru_Guru1X", [])).toJSON();
  assert.match(embed.footer.text, new RegExp(`SergeantGuruV2 \\| .* \\| ID: ${interactionId}`));
  assert.doesNotMatch(embed.footer.text, /\| [a-f0-9]{10} \|/);
});

test("all embed footers use the universal format even without an interaction context", () => {
  const embed = createGroupsEmbed("Guru_Guru1X", []).toJSON();
  assert.match(embed.footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: N\/A$/);
});

test("paginates embeds without splitting related blocks", () => {
  const interactionId = "1570581254280183828";
  const info = () => createInfoEmbed({
    pingMs: 42,
    servers: 2,
    totalUsers: 120,
    uptimeSeconds: 3600,
    commandCount: commands.length,
    authorizedUsers: 3,
    authorizedRoles: 1,
    botId: "1186370477606838375",
    memoryMb: 128.4,
    robloxOnline: true,
    robloxCloud: true,
    xtracker: false,
    robloxWatcher: true,
    exploitWatcher: true,
    dailyUsage: null,
  });
  const original = info().toJSON();
  const pages = runWithInteractionId(interactionId, () => paginateEmbed(info()));

  assert.ok(pages.length > 1, "/info needs more than one page");
  const descriptions = pages.map((page) => page.toJSON().description).filter(Boolean);
  assert.deepEqual(descriptions, [original.description], "the description stays on one page");

  const fields = pages.flatMap((page) => page.toJSON().fields);
  assert.deepEqual(
    fields.map(({ name, value }) => ({ name, value })),
    original.fields.map(({ name, value }) => ({ name, value })),
    "no field is split across pages",
  );

  for (const [index, page] of pages.entries()) {
    const json = page.toJSON();
    assert.match(json.title, new RegExp(`\\(Page ${index + 1}/${pages.length}\\)$`));
    assert.match(json.footer.text, new RegExp(`^SergeantGuruV2 \\| \\d{2}:\\d{2}Z \\| ID: ${interactionId}$`));
  }

  const short = runWithInteractionId(interactionId, () => createGroupsEmbed("Guru_Guru1X", []));
  assert.equal(paginateEmbed(short).length, 1, "short embeds are left alone");
});

test("a single long field stays together even when it exceeds the page target", () => {
  const longField = Array.from({ length: 20 }, (_, index) => `Related line ${index + 1}`).join("\n");
  const embed = new EmbedBuilder()
    .setTitle("Long Block")
    .addFields(
      { name: "Related Info", value: longField },
      { name: "Other Info", value: "One more line" },
    );

  const pages = paginateEmbed(embed);
  assert.equal(pages.length, 2);
  const first = pages[0].toJSON();
  assert.equal(first.fields.length, 1);
  assert.equal(first.fields[0].name, "Related Info");
  assert.equal(first.fields[0].value, longField);
  assert.ok(first.fields[0].value.split("\n").length > PAGE_LINE_LIMIT);
  assert.equal(pages[1].toJSON().fields[0].name, "Other Info");
});

test("/search embeds every matching log and pagination never drops a result", () => {
  const total = 60;
  const results = Array.from({ length: total }, (_, index) => {
    const userId = String(100000000000000000n + BigInt(index));
    const interactionId = String(200000000000000000n + BigInt(index));
    return {
      action: `Action ${index + 1}`,
      access: "GRANTED",
      user: `<@${userId}>`,
      userId,
      interactionId,
      url: `https://discord.com/channels/1/2/${300000000000000000n + BigInt(index)}`,
    };
  });
  const pages = createSearchResultEmbeds("tester", results, 1234, true);
  assert.ok(pages.length > 1, "large result sets should paginate instead of failing");
  const json = pages.map((page) => page.toJSON());
  assert.equal(
    json[0].description,
    `Found ${total} matching interactions for **tester** across 1,234 scanned log messages.`,
  );
  assert.equal(json[0].title, "Interaction Search Results");
  for (const page of json) {
    assert.ok(page.fields.length <= 25, "each page must respect Discord's 25-field limit");
    assert.match(page.footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: /);
  }
  const shown = json.flatMap((page) => page.fields);
  assert.equal(shown.length, total, "pagination must not drop search results");
  assert.deepEqual(
    shown.map(({ name }) => name),
    results.map((_, index) => `Result ${index + 1}`),
  );
  assert.match(shown[0].value, new RegExp(results[0].userId));
  assert.match(shown[0].value, new RegExp(`Interaction ID: ${results[0].interactionId}`));
  assert.match(shown[total - 1].value, /\[Jump to log message\]\(https:\/\/discord\.com\/channels\/1\/2\//);

  const pagination = buildPaginationFromPages(pages);
  assert.equal(pagination.embeds.length, 1);
  assert.match(pagination.embeds[0].toJSON().title, new RegExp(`\\(Page 1/${pages.length}\\)$`));
  const buttons = pagination.components[0].toJSON().components;
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
});

test("/search reports when the scan limit was reached", () => {
  const result = {
    action: "Background Check",
    access: "GRANTED",
    user: "<@1000000000000000001>",
    userId: "1000000000000000001",
    interactionId: "2000000000000000001",
    url: "https://discord.com/channels/1/2/3",
  };
  const single = createSearchResultEmbeds("tester", [result], 500, true)[0].toJSON();
  assert.equal(single.description, "Found 1 matching interaction for **tester** across 500 scanned log messages.");
  assert.equal(single.fields.length, 1);

  const capped = createSearchResultEmbeds("tester", [result], 100000, false)[0].toJSON();
  assert.equal(
    capped.description,
    "Found 1 matching interaction for **tester** in the latest 100,000 log messages (search limit reached).",
  );
});

test("Discord user IDs are distinguished from Roblox usernames", () => {
  assert.equal(isDiscordUserId("123456789012345678"), true);
  assert.equal(isDiscordUserId(" 12345678901234567890 "), true);
  assert.equal(isDiscordUserId("12345"), false);
  assert.equal(isDiscordUserId("Tester_123"), false);
  assert.equal(isDiscordUserId("12345678901234567890123"), false);
});

test("paginated results survive a restart, so any member can keep paging", () => {
  const first = new EmbedBuilder().setTitle("First page").addFields({ name: "Page", value: "one" });
  const second = new EmbedBuilder().setTitle("Second page").addFields({ name: "Page", value: "two" });
  const { components } = buildPaginationFromPages([first, second]);
  const customId = components[0].toJSON().components[0].custom_id;
  assert.match(customId, /^pager:[a-f0-9]+:-1$/);
  const token = customId.split(":")[1];

  const restored = restorePaginationSession(token);
  assert.ok(restored, "the session must be reloadable from the database");
  assert.equal(restored.pages.length, 2);
  assert.equal(restored.pages[1].toJSON().title, "Second page (Page 2/2)");
  assert.deepEqual(restored.extraRows, []);
  assert.ok(restored.createdAt > 0);
});

test("pagination controls step through valid pages", () => {
  const embed = runWithInteractionId("1570581254280183828", () => createApiStatusEmbed(
    Array.from({ length: 20 }, (_, index) => ({
      name: `Service ${index + 1}`,
      state: "Online",
      detail: "ok",
    })),
  ));
  const pagination = buildPagination(embed);
  assert.equal(pagination.embeds.length, 1);
  assert.equal(pagination.components.length, 1);

  const buttons = pagination.components[0].toJSON().components;
  assert.match(buttons[0].custom_id, /^pager:[a-f0-9]+:-1$/);
  assert.match(buttons[1].custom_id, /^pager:[a-f0-9]+:1$/);
  assert.match(buttons[1].custom_id, /^pager:[a-f0-9]+:1$/);
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
});

test("interaction logs link servers, channels, and DMs while keeping IDs", () => {
  const guild = interactionLogLocations({
    guildId: "1447012918590967880",
    guildName: "CBRN",
    channelId: "1483210528620019908",
    channelName: "general",
  });
  assert.equal(guild.server, "[CBRN](https://discord.com/channels/1447012918590967880) (1447012918590967880)");
  assert.equal(guild.channel, "[general](https://discord.com/channels/1447012918590967880/1483210528620019908) (1483210528620019908)");

  const dm = interactionLogLocations({
    guildId: null,
    channelId: "1483210528620019908",
    channelName: "friend",
  });
  assert.equal(dm.server, "Direct message");
  assert.equal(dm.channel, "[friend](https://discord.com/channels/@me/1483210528620019908) (1483210528620019908)");
});

test("groups embeds omit the invalid empty description", () => {
  const embed = createGroupsEmbed("Guru_Guru1X", [
    { group: { id: 32619026, name: "CBRN Joint Warfare Operations" }, role: { name: "JWO Auxiliary" } },
  ]).toJSON();
  assert.equal(embed.title, "CBRN Groups — Guru_Guru1X");
  assert.equal(embed.description, undefined);
  assert.equal(embed.fields[0].name, "Ranks & Division");
  assert.match(embed.fields[0].value, /CBRN Joint Warfare Operations.*JWO Auxiliary/);
  assert.match(
    embed.fields[0].value,
    /\[CBRN Joint Warfare Operations\]\(https:\/\/www\.roblox\.com\/groups\/32619026\)/,
    "group names must be clickable links",
  );
  assert.equal(
    createGroupsEmbed("Guru_Guru1X", [{ group: { id: 999, name: "Unrelated" }, role: { name: "Member" } }])
      .toJSON().fields[0].value,
    "None",
    "only the tracked CBRN groups are listed",
  );
});

test("renders badge chart text at a higher resolution", async () => {
  const image = await makeBadgeChart("TestUser", [{ addTime: "2024-01-01T00:00:00.000Z" }], "#5865f2");
  assert.equal(image.readUInt32BE(16), 3000);
  assert.equal(image.readUInt32BE(20), 1800);
});

test("formats chart counts with ASCII thousands separators", () => {
  assert.equal(formatChartCount(999), "999");
  assert.equal(formatChartCount(1252), "1,252");
  assert.equal(formatChartCount(1_000_000), "1,000,000");
  // The glyph atlas has no locale-specific space glyph, so every character in
  // a chart label must be a plain digit or comma.
  assert.match(formatChartCount(1252), /^[0-9,]+$/);
});

test("api status embed reports every integration state", () => {
  const embed = createApiStatusEmbed([
    { name: "Discord Gateway", state: "Online", detail: "42ms ping" },
    { name: "Roblox Users API", state: "Online", detail: "ok", latencyMs: 88 },
    { name: "xTracker", state: "Degraded", detail: "not configured", latencyMs: 12 },
  ]).toJSON();
  assert.match(embed.description, /2\/3.*online/);
  assert.deepEqual(embed.fields.map(({ name }) => name), [
    "🟢 Discord Gateway",
    "🟢 Roblox Users API",
    "🟡 xTracker",
  ]);
  assert.match(embed.fields[1].value, /88ms/);
});

test("alt-risk AI calls reject quickly when Ollama is not running", async () => {
  const unreachable = { baseUrl: "http://127.0.0.1:1", model: "qwen2.5:1.5b" };
  await assert.rejects(assessAltRisk({ signals: { account_age_days: 1 }, ...unreachable }));
});

test("linux launcher treats Ollama as optional so the bot always starts", () => {
  const launcher = readFileSync(new URL("../../Start SergeantGuruV2.sh", import.meta.url), "utf8");
  assert.match(launcher, /Checking Ollama \(optional\)/);
  assert.match(launcher, /Ollama is not installed/);
  assert.match(launcher, /Ollama did not respond in time/);
  assert.match(launcher, /pnpm start/);
  assert.match(launcher, /read -r -n 1 -s -p/);
});

test("clamps and validates local alt-risk AI assessments", () => {
  assert.deepEqual(parseAltAssessment({ chance: 140, reason: "  Very new account with no badges.  " }), {
    chance: 100,
    reason: "Very new account with no badges.",
  });
  assert.deepEqual(parseAltAssessment('{"chance":"38","reason":""}'), { chance: 38, reason: "" });
  assert.throws(() => parseAltAssessment({ chance: "high" }), /numeric chance/);
  assert.throws(() => parseAltAssessment("not json"), /invalid JSON/);
});

test("blends plausible alt-risk AI estimates and ignores wild ones", () => {
  assert.deepEqual(blendAltRisk(10, 90), { score: 10, usedAi: false });
  assert.deepEqual(blendAltRisk(50, 70), { score: 60, usedAi: true });
  assert.deepEqual(blendAltRisk(30, 60), { score: 45, usedAi: true });
  assert.deepEqual(blendAltRisk(40, undefined), { score: 40, usedAi: false });
});

test("alt risk scores every available account signal", () => {
  const richSignals = {
    created: new Date(Date.now() - 5 * 365 * 86_400_000),
    badgeCount: 1000,
    friends: { friends: 200, followers: 500, following: 200 },
    usernameChanges: 0,
    hasBlacklist: false,
    hasSecret: false,
    hasExternalRecords: false,
    groupCount: 20,
    divisionRankCount: 5,
    avatarAssetCount: 30,
    avatarAssetTypeCount: 10,
    wearingCount: 8,
    createdGames: 10,
    favoriteGames: 20,
    inventoryItemCount: 900,
    inventoryAssetTypeCount: 20,
    gamepassCount: 10,
    inventoryPrivate: false,
  };
  const [richScore, richBand] = altRisk(richSignals);
  assert.equal(richScore, 0);
  assert.equal(richBand, "Minimal");
  assert.ok(altRisk({ ...richSignals, hasBlacklist: true })[0] >= 65);
  assert.ok(altRisk({ ...richSignals, hasSecret: true })[0] >= 55);
  assert.ok(altRisk({ ...richSignals, hasExternalRecords: true })[0] >= 45);

  const [emptyScore, emptyBand] = altRisk({
    created: new Date(),
    badgeCount: 0,
    friends: { friends: 0, followers: 0, following: 0 },
    usernameChanges: 6,
    hasBlacklist: true,
    hasSecret: true,
    hasExternalRecords: true,
    groupCount: 0,
    divisionRankCount: 0,
    avatarAssetCount: 0,
    avatarAssetTypeCount: 0,
    wearingCount: 0,
    createdGames: 0,
    favoriteGames: 0,
    inventoryItemCount: 0,
    inventoryAssetTypeCount: 0,
    gamepassCount: 0,
    inventoryPrivate: true,
  });
  assert.equal(emptyScore, 100);
  assert.equal(emptyBand, "High");
});

test("alt-risk AI refuses non-local model endpoints", async () => {
  await assert.rejects(
    assessAltRisk({
      signals: { account_age_days: 1 },
      baseUrl: "https://example.com",
      model: "qwen2.5:1.5b",
    }),
    /must use a local Ollama address/,
  );
});
