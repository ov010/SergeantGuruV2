import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationIntegrationType, InteractionContextType } from "discord.js";

process.env["NODE_ENV"] = "test";
process.env["DISCORD_BOT_TOKEN"] = "test-token";
process.env["ROBLOX_OPEN_CLOUD_API_KEY"] = "test-key";

const {
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
  createGradingFeedbackLogEmbed,
  createGroupsEmbed,
  createInteractionLogEmbed,
  formatHostRatingReport,
  makeBadgeChart,
  matchesInteractionLog,
  runWithInteractionId,
} = await import("../dist/bot.mjs");
const { parseGradeMistakeSuggestions, parseGradeReview, suggestNewGradeMistakes } = await import("../dist/bot-grade-ai.mjs");
const { assessAltRisk, parseAltAssessment } = await import("../dist/bot-alt-ai.mjs");

test("registers only the retained commands", () => {
  const registered = commands.map((command) => command.toJSON());
  assert.deepEqual(
    registered.map(({ name }) => name),
    ["background", "badge", "grade", "api", "groups", "info", "changelog", "data", "search", "admin"],
  );
  assert.equal(registered.find(({ name }) => name === "admin").options?.length ?? 0, 0);
  assert.equal(registered.find(({ name }) => name === "badge").options[0].name, "count");
  assert.equal(registered.find(({ name }) => name === "search").options[0].name, "query");
  const version = registered.find(({ name }) => name === "changelog").options[0];
  assert.equal(version.name, "version");
  assert.equal(version.type, 3);
  assert.ok(!version.required);
  assert.match(registered.find(({ name }) => name === "search").description, /username, user ID, or interaction ID/);
});

test("changelog parses newest-first releases, CRLF bullets, and ignores malformed sections", () => {
  assert.deepEqual(parseChangelog("# Change Log\r\n## 1.1.0 - 2026-11-11\r\n- Added command\r\n- Added colors\r\n## invalid\r\n- ignored\r\n## 1.0.0 - 2026-01-01\r\n- Initial release"), [
    { version: "1.1.0", date: "2026-11-11", descriptions: ["Added command", "Added colors"] },
    { version: "1.0.0", date: "2026-01-01", descriptions: ["Initial release"] },
  ]);
  assert.deepEqual(parseChangelog(""), []);
  assert.deepEqual(parseChangelog("## malformed\n- ignored"), []);
});

test("changelog embeds select latest or requested versions and handle missing releases", () => {
  const markdown = "## 1.1.0 - 2026-11-11\n- New command\n## 1.0.0 - 2026-01-01\n- Initial release";
  const latest = createChangelogEmbed(markdown).toJSON();
  assert.equal(latest.title, "Change Log");
  assert.match(latest.description, /1\.1\.0 - 2026-11-11/);
  assert.match(latest.description, /New command/);
  assert.match(createChangelogEmbed(markdown, "1.0.0").toJSON().description, /Initial release/);
  for (const embed of [createChangelogEmbed(""), createChangelogEmbed(markdown, "missing")]) {
    assert.equal(embed.toJSON().title, "Change Log Unavailable");
  }
  const long = createChangelogEmbed(`## 1.1.0 - 2026-11-11\n- ${"x".repeat(7000)}`).toJSON();
  assert.ok(long.description.length <= 4096);
  assert.ok(COLOR_TARGETS.includes("Change Log"));
  assert.ok(COLOR_TARGETS.includes("Change Log Unavailable"));
});

test("changelog loads the repository release notes from the bundled runtime path", async () => {
  const embed = (await loadChangelogEmbed()).toJSON();
  assert.equal(embed.title, "Change Log");
  assert.match(embed.description, /1\.1\.0/);
  assert.match(embed.description, /changelog/);
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
  assert.ok(lines.some((line) => line.startsWith("• **/grade**")));
});

test("/data consolidates overview, access lists, and settings into one embed", () => {
  const embed = createDataEmbed(true).toJSON();
  const fields = embed.fields.map(({ name }) => name);
  assert.equal(embed.title, "Bot Data");
  assert.ok(fields.includes("Runtime"));
  assert.ok(fields.includes("Discord"));
  assert.ok(fields.includes("Activity"));
  assert.ok(fields.includes("Access"));
  assert.ok(fields.includes("Authorized Users"));
  assert.ok(fields.includes("Authorized Roles"));
  assert.ok(fields.includes("Embed Colors"));
  assert.ok(fields.includes("Rotating Presence"));
  assert.ok(fields.includes("Integrations"));
  assert.doesNotMatch(embed.fields.find(({ name }) => name === "Integrations").value, /Trello/);
  assert.match(embed.fields.find(({ name }) => name === "Discord").value, /Ping:/);
  assert.ok(embed.description.includes("**/data**"));
  assert.ok(embed.fields.length <= 25);
  const totalCharacters = embed.title.length
    + embed.description.length
    + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0)
    + embed.footer.text.length;
  assert.ok(totalCharacters <= 6000);
  assert.ok(embed.fields.every(({ value }) => value.length <= 1024));
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
    server: "1447012918590967880",
    channel: "1483210528620019908",
    interactionId: "1569668990463385620",
    messageLink: "https://discord.com/channels/1447012918590967880/1483210528620019908/1569668990463385621",
  };
  const allowed = createInteractionLogEmbed({ ...fields, access: "allowed" }).toJSON();
  const denied = createInteractionLogEmbed({ ...fields, access: "denied" }).toJSON();
  const expectedFieldNames = [
    "Action",
    "Access",
    "User",
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
  assert.equal(allowed.fields[2].value, "guru_guru1x");
  assert.equal(allowed.fields[3].value, fields.userId);
  assert.equal(allowed.fields[7].value, fields.messageLink);
  assert.ok(allowed.fields.every(({ inline }) => inline === true));
  assert.ok(denied.fields.every(({ inline }) => inline === true));
  assert.equal(allowed.fields.some(({ name }) => name === "Changed"), false);
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

test("groups embeds omit the invalid empty description", () => {
  const embed = createGroupsEmbed("Guru_Guru1X", [
    { group: { id: 32619026, name: "CBRN Joint Warfare Operations" }, role: { name: "JWO Auxiliary" } },
  ]).toJSON();
  assert.equal(embed.title, "CBRN Groups — Guru_Guru1X");
  assert.equal(embed.description, undefined);
  assert.equal(embed.fields[0].name, "Ranks & Division");
  assert.match(embed.fields[0].value, /CBRN Joint Warfare Operations.*JWO Auxiliary/);
});

test("renders badge chart text at a higher resolution", async () => {
  const image = await makeBadgeChart("TestUser", [{ addTime: "2024-01-01T00:00:00.000Z" }], "#5865f2");
  assert.equal(image.readUInt32BE(16), 3000);
  assert.equal(image.readUInt32BE(20), 1800);
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
