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
  createAdminModal,
  createAdminPanelMenu,
  createApiStatusEmbed,
  createColorMenu,
  createColorTargetMenu,
  createDataEmbed,
  createDataViewMenu,
  createInfoEmbed,
  createGradingFeedbackLogEmbed,
  createGroupsEmbed,
  createRecordsEmbed,
  createInteractionLogEmbed,
  createSearchResultEmbeds,
  buildPaginationFromPages,
  DAILY_COMMAND_LIMIT,
  consumeDailyCommand,
  resetDailyCommandUsage,
  DATA_VIEW_LABELS,
  PAGE_LINE_LIMIT,
  buildPagination,
  formatHostRatingReport,
  interactionLogLocations,
  makeBadgeChart,
  formatChartCount,
  matchesInteractionLog,
  paginateEmbed,
  runWithInteractionId,
} = await import("../dist/bot.mjs");
const { parseGradeMistakeSuggestions, parseGradeReview, suggestNewGradeMistakes } = await import("../dist/bot-grade-ai.mjs");
const { assessAltRisk, parseAltAssessment } = await import("../dist/bot-alt-ai.mjs");

test("registers only the retained commands", () => {
  const registered = commands.map((command) => command.toJSON());
  assert.deepEqual(
    registered.map(({ name }) => name),
    ["background", "badge", "grade", "api", "groups", "records", "info", "changelog", "data", "search", "admin"],
  );
  assert.equal(registered.find(({ name }) => name === "admin").options?.length ?? 0, 0);
  assert.equal(registered.find(({ name }) => name === "badge").options[0].name, "count");
  assert.equal(registered.find(({ name }) => name === "search").options[0].name, "query");
  assert.equal(registered.find(({ name }) => name === "changelog").options?.length ?? 0, 0);
  assert.match(registered.find(({ name }) => name === "search").description, /every logged interaction by username, user ID, or interaction ID/);
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
  assert.ok(lines.some((line) => line.startsWith("• **/records**")));
  assert.ok(lines.some((line) => line.startsWith("• **/grade**")));
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

test("admin and data menus describe every option", () => {
  for (const menu of [createAdminPanelMenu(), createDataViewMenu("access")]) {
    const options = menu.toJSON().components[0].options;
    assert.ok(options.every((option) => option.description?.trim()), "every menu option needs a description");
  }
});

test("/data opens separate views for access, bot/API, and colors", () => {
  const menu = createDataViewMenu("access").toJSON().components[0];
  assert.equal(menu.custom_id, "data-view");
  assert.deepEqual(menu.options.map(({ value }) => value), ["overview", "access", "bot", "colors"]);
  assert.deepEqual(menu.options.map(({ label }) => label), Object.values(DATA_VIEW_LABELS));
  assert.ok(menu.options.find(({ value }) => value === "access").default);

  const overview = createDataEmbed("overview").toJSON();
  assert.equal(overview.title, "Bot Data");
  assert.ok(overview.description.includes("**/data**"));
  assert.ok(overview.fields.some(({ name }) => name === "Authorized Users"));
  assert.ok(overview.fields.some(({ name }) => name === "Authorized Roles"));

  const access = createDataEmbed("access").toJSON();
  const accessField = access.fields.find(({ name }) => name === "Access");
  assert.match(accessField.value, /Authorized users:/);
  assert.match(accessField.value, /Authorized roles:/);
  assert.ok(access.fields.some(({ name }) => name === "Authorized Users"));
  assert.ok(access.fields.some(({ name }) => name === "Authorized Roles"));

  const bot = createDataEmbed("bot", {
    robloxApiOnline: true,
    ollama: { name: "Ollama (grading AI)", state: "Online", detail: "qwen2.5:0.5b", latencyMs: 12 },
  }).toJSON();
  const integrations = bot.fields.find(({ name }) => name === "Integrations").value;
  assert.match(integrations, /Roblox Public API: Online/);
  assert.match(integrations, /Ollama \(grading AI\): Online — qwen2\.5:0\.5b/);
  const runtime = bot.fields.find(({ name }) => name === "Runtime").value;
  assert.ok(runtime.includes(`Version: ${BOT_VERSION}`), "the Bot & API view must report the running version");
  assert.match(runtime, /Uptime:/);
  assert.match(bot.fields.find(({ name }) => name === "Discord").value, /Ping:/);

  const colors = createDataEmbed("colors").toJSON();
  assert.ok(colors.fields.some(({ name }) => name === "Embed Colors"));
  assert.ok(colors.fields.some(({ name }) => name === "Rotating Presence"));

  for (const view of ["overview", "access", "bot", "colors"]) {
    const embed = createDataEmbed(view, {
      robloxApiOnline: false,
      ollama: { name: "Ollama (grading AI)", state: "Offline", detail: "Unreachable", latencyMs: 3 },
    }).toJSON();
    assert.ok(embed.fields.length <= 25, `${view} exceeds the embed field limit`);
    assert.ok(embed.fields.every(({ value }) => value.length <= 1024), `${view} has an oversized field`);
  }
});

test("every command except the public admin panel requires granted access", () => {
  const registered = commands.map((command) => command.toJSON().name);
  assert.deepEqual(
    registered.filter((name) => !ACCESS_CONTROLLED_COMMANDS.has(name)),
    ["admin"],
  );
  for (const name of ["background", "badge", "groups", "changelog", "info", "grade"]) {
    assert.ok(ACCESS_CONTROLLED_COMMANDS.has(name), `${name} must require access`);
  }
});

test("authorized users get exactly 50 commands per UTC day", () => {
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
    assert.equal(blocked.allowed, false, "command 51 must be blocked");
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

test("/info reports live Ollama status alongside the other integrations", () => {
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
    ollama: { name: "Ollama (grading AI)", state: "Online", detail: "qwen2.5:0.5b", latencyMs: 8 },
    dailyUsage: {
      allowed: true,
      used: 7,
      limit: DAILY_COMMAND_LIMIT,
      remaining: DAILY_COMMAND_LIMIT - 7,
      resetAt: new Date("2026-11-14T00:00:00Z"),
    },
  }).toJSON();
  const ollama = embed.fields.find(({ name }) => name === "Ollama (grading AI)");
  assert.ok(ollama, "/info must show Ollama status");
  assert.equal(ollama.value, "Online — qwen2.5:0.5b\n8ms");
  assert.match(embed.fields.find(({ name }) => name === "Daily Commands").value, /^7\/50 used/);
  assert.equal(embed.fields.find(({ name }) => name === "Version").value, BOT_VERSION);
  assert.equal(embed.fields.find(({ name }) => name === "Ping").value, "42ms");
  assert.equal(embed.fields.find(({ name }) => name === "Uptime").value, "1h 0s");
});

test("grading feedback log is an embed with a sheet-ready row and owner ping", () => {
  const embed = createGradingFeedbackLogEmbed({
    mistake: "broke oos.",
    severity: "MODERATE",
    userId: "1186370477606838375",
    username: "guru_guru1x",
  }).toJSON();
  assert.equal(embed.title, "Grading Feedback Saved");
  assert.match(embed.description, /Google Sheet/);
  assert.equal(embed.fields.find(({ name }) => name === "Severity").value, "MODERATE");
  assert.match(embed.fields.find(({ name }) => name === "Submitted by").value, /guru_guru1x \(<@1186370477606838375>\)/);
  assert.match(embed.fields.find(({ name }) => name === "Google Sheets entry").value, /\[-\] broke OOS\. - MODERATE/);
});

test("host rating report uses the requested format, colors, and grammar fixes", () => {
  const report = formatHostRatingReport({
    evaluator: "Guru_Guru1X",
    host: "Host_User",
    eventType: "vip training",
    positives: ["[-] flawless event otherwise"],
    negatives: [
      "let attendee fall in without them asking ptfi",
      "hesitated to restart round after attendee went afk",
      "Set os to be 15 instead of 11.",
    ],
    score: 85,
    passed: true,
  });
  assert.match(report, /^\*\*Your Username:\*\* Guru_Guru1X$/m);
  assert.match(report, /^\*\*Host's Username:\*\* Host_User$/m);
  assert.match(report, /^\*\*Event Type:\*\* VIP Training$/m);
  assert.match(report, /^\*\*Rating: 8\.5\/10 \| PASS\*\*$/m);
  assert.match(report, /\u001b\[38;2;64;222;64m\n\[\+\] Flawless event otherwise\./);
  assert.match(report, /\u001b\[38;2;255;36;36m\n\[\-\] Let attendee fall in without them asking PTFI\./);
  assert.match(report, /\[\-\] Hesitated to restart round after attendee went AFK\./);
  assert.match(report, /\[\-\] Set OS to be 15 instead of 11\./);
  assert.match(report, /^\*\*Proof: \*\*$/m);
});

test("host rating report handles a perfect score and missing feedback", () => {
  const report = formatHostRatingReport({
    evaluator: "Guru_Guru1X",
    host: "Host_User",
    eventType: "Guarding Evaluation",
    positives: [],
    negatives: [],
    score: 100,
    passed: true,
  });
  assert.match(report, /^\*\*Rating: 10\/10 \| PASS\*\*$/m);
  assert.equal(report.match(/\(none recorded\)/g)?.length, 2);
});

test("admin modal and color menus provide selectable access and appearance settings", () => {
  const accessModal = createAdminModal("authorize-user").toJSON();
  const presenceModal = createAdminModal("presence").toJSON();
  const adminActions = createAdminPanelMenu().toJSON().components[0].options;
  const pageCount = Math.ceil(COLOR_TARGETS.length / 24);
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
    ollama: { name: "Ollama (grading AI)", state: "Online", detail: "qwen2.5:0.5b", latencyMs: 8 },
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
});

test("/records shows only blacklist, Secret Service, and [x]Tracker records", () => {
  const embed = createRecordsEmbed(
    "Guru_Guru1X",
    "123456789",
    "• [Blacklist case](https://trello.com/c/blacklist)",
    "None",
    "**Entry #1**\n**Reason:** Exploiting",
  ).toJSON();
  assert.equal(embed.title, "Records — Guru_Guru1X");
  assert.equal(embed.url, "https://www.roblox.com/users/123456789/profile");
  assert.deepEqual(embed.fields.map(({ name }) => name), [
    "Blacklist Record",
    "Secret Service Record",
    "[x]Tracker Records",
  ]);
  assert.match(embed.fields[0].value, /Blacklist case/);
  assert.equal(embed.fields[1].value, "None");
  assert.match(embed.fields[2].value, /Exploiting/);
  assert.match(embed.footer.text, /^SergeantGuruV2 \| \d{2}:\d{2}Z \| ID: /);

  const long = createRecordsEmbed("User", "1", "x".repeat(2000), "None", "None").toJSON();
  assert.equal(long.fields[0].value.length, 1024, "long record lists are capped at the embed field limit");
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

test("keeps only valid novel grading suggestions in sheet-ready format", () => {
  const suggestions = parseGradeMistakeSuggestions({
    suggestions: [
      { source_index: 0, mistake: "  Failure to secure the lobby  ", severity: "MINOR", reason: "Not covered by the rubric." },
      { source_index: 1, mistake: "Failure to obey a VIP order.", severity: "MODERATE", reason: "Already listed." },
      { source_index: 2, mistake: "A possible exploit.", severity: "AUTO_FAIL", reason: "Invalid severity for this evaluation." },
      { source_index: 3, mistake: "Terminated the VIP intentionally.", severity: "EXTREME", reason: "New extreme rule for VIP Training." },
    ],
  }, [
    "Did not secure the lobby",
    "Failure to obey a VIP order",
    "A possible exploit",
    "Terminated the VIP intentionally",
  ], "VIP Training", ["Failure to obey a VIP order"]);
  assert.deepEqual(suggestions, [
    {
      mistake: "Failure to secure the lobby",
      severity: "MINOR",
      reason: "Not covered by the rubric.",
    },
    {
      mistake: "Terminated the VIP intentionally.",
      severity: "EXTREME",
      reason: "New extreme rule for VIP Training.",
    },
  ]);
});

test("only applies sheet-verified review matches and safe grammar fixes", () => {
  const reviews = parseGradeReview({
    reviews: [
      { index: 0, rubric: "failure to obey a vip order", corrected: "Failed to obey a VIP order.", reason: "Same behavior." },
      { index: 1, rubric: "Something that is not in the sheet", corrected: "Unrelated replacement text.", reason: "No match." },
      { index: 0, rubric: "Failure to obey a VIP order", corrected: "Duplicate index." },
      { index: 2, rubric: "Terminating your own VIP", corrected: "Terminating your own VIP." },
      { index: 9, rubric: "Failure to obey a VIP order", corrected: "Out of range." },
    ],
  }, ["didnt obey the vip order", "random thing happened", "Terminating your own VIP"], "VIP Training", [
    { mistake: "Failure to obey a VIP order", severity: "MINOR" },
    { mistake: "Terminating your own VIP", severity: "EXTREME" },
  ]);
  assert.deepEqual(reviews, [{
    original: "didnt obey the vip order",
    index: 0,
    correctedText: "Failed to obey a VIP order.",
    rubricMistake: "Failure to obey a VIP order",
    severity: "MINOR",
    reason: "Same behavior.",
  }]);
});

test("accepts EXTREME rubric matches in VIP Training reviews", () => {
  const reviews = parseGradeReview({
    reviews: [{ index: 0, rubric: "Terminating your own VIP", corrected: "Terminating your own VIP." }],
  }, ["Terminating your own VIP"], "VIP Training", [
    { mistake: "Terminating your own VIP", severity: "EXTREME" },
  ]);
  assert.deepEqual(reviews, [{
    original: "Terminating your own VIP",
    index: 0,
    correctedText: "",
    rubricMistake: "Terminating your own VIP",
    severity: "EXTREME",
    reason: "",
  }]);
});

test("drops an AI rewrite that no longer resembles the original", () => {
  const reviews = parseGradeReview({
    reviews: [{ index: 0, rubric: "Failure to secure the lobby", corrected: "Completely unrelated sentence about lunch.", reason: "" }],
  }, ["The lobby was not secure"], "Guarding Evaluation", [
    { mistake: "Failure to secure the lobby", severity: "MODERATE" },
  ]);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].correctedText, "");
});

test("accepts numbered rubric matches from the local model", () => {
  const reviews = parseGradeReview({
    reviews: [{ index: 0, rule: 1, corrected: "Didn't secure the lobby." }],
  }, ["didnt secure the lobby"], "Guarding Evaluation", [
    { mistake: "Failure to secure the lobby", severity: "MODERATE" },
  ]);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].severity, "MODERATE");
  assert.equal(reviews[0].correctedText, "Didn't secure the lobby.");
});

test("rejects a short rule that only shares filler words", () => {
  const reviews = parseGradeReview({
    reviews: [{ index: 0, candidate: 1, corrected: "Was rude to the VIP." }],
  }, ["was rude to the vip"], "Guarding Evaluation", [
    { mistake: "Killed the VIP.", severity: "MAJOR" },
  ]);
  assert.deepEqual(reviews, []);
});

test("rejects a forced rubric match with no real word overlap", () => {
  const reviews = parseGradeReview({
    reviews: [{ index: 0, rule: 1, corrected: "Was rude to the VIP." }],
  }, ["was rude to the vip"], "Guarding Evaluation", [
    { mistake: "Failure to obey a VIP order", severity: "MINOR" },
  ]);
  assert.deepEqual(reviews, []);
});

test("api status embed reports every integration state", () => {
  const embed = createApiStatusEmbed([
    { name: "Discord Gateway", state: "Online", detail: "42ms ping" },
    { name: "Google Sheets Rubric", state: "Online", detail: "432 rules", latencyMs: 88 },
    { name: "Ollama (grading AI)", state: "Degraded", detail: "qwen2.5:0.5b is not pulled", latencyMs: 12 },
  ]).toJSON();
  assert.match(embed.description, /2\/3.*online/);
  assert.deepEqual(embed.fields.map(({ name }) => name), [
    "🟢 Discord Gateway",
    "🟢 Google Sheets Rubric",
    "🟡 Ollama (grading AI)",
  ]);
  assert.match(embed.fields[1].value, /88ms/);
});

test("grading AI refuses non-local model endpoints", async () => {
  await assert.rejects(
    suggestNewGradeMistakes({
      eventType: "VIP Training",
      mistakes: ["Did not secure the lobby"],
      knownRules: [],
      baseUrl: "https://example.com",
      model: "qwen2.5:0.5b",
    }),
    /must use a local Ollama address/,
  );
});

test("local AI calls reject quickly when Ollama is not running", async () => {
  const unreachable = { baseUrl: "http://127.0.0.1:1", model: "qwen2.5:0.5b" };
  await assert.rejects(suggestNewGradeMistakes({
    eventType: "Guarding Evaluation",
    mistakes: ["Did not secure the lobby"],
    knownRules: [],
    ...unreachable,
  }));
  await assert.rejects(assessAltRisk({ signals: { account_age_days: 1 }, ...unreachable }));
});

test("launcher treats Ollama as optional so the bot always starts", () => {
  const launcher = readFileSync(new URL("../../Start SergeantGuruV2.bat", import.meta.url), "utf8");
  assert.match(launcher, /Checking Ollama \(optional\)/);
  assert.match(launcher, /:OLLAMA_MISSING/);
  assert.match(launcher, /:OLLAMA_UNAVAILABLE/);
  assert.match(launcher, /:START_BOT/);
  assert.match(launcher, /call pnpm\.cmd start/);
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
      model: "qwen2.5:0.5b",
    }),
    /must use a local Ollama address/,
  );
});
