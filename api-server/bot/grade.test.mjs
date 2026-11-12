import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  aggregateGradeCandidates,
  calculateGrade,
  calculateHostingGrade,
  capitalizeGradeAbbreviations,
  correctGradeMistakeGrammar,
  formatGradeFeedback,
  gradePassThreshold,
  gradingAbbreviations,
  normalizeGradeText,
  parseGradeCandidates,
} from "../dist/bot-grade.mjs";
import {
  createGradeRules,
  fetchGradeSheetRules,
  gradeSheetSeverityOverrides,
  mistakeMatchesSheetRule,
  parseGradeSheetCsv,
} from "../dist/grade-sheet.mjs";

const rules = createGradeRules([
  { mistake: "Failure to obey a VIP order", severity: "MINOR" },
  { mistake: "Failure to use threat analysis", severity: "MODERATE" },
  { mistake: "Failure to cuff vip to safety", severity: "MODERATE" },
  { mistake: "Some positioning mishaps", severity: "MODERATE" },
  { mistake: "Didn't do SFL correctly", severity: "MINOR" },
  { mistake: "Failure to aura from orbital/airstrike", severity: "MAJOR" },
  { mistake: "Terminating your own VIP", severity: "EXTREME" },
  { mistake: "Failure to respond to PTS request", severity: "MINOR" },
  { mistake: "Failure to regain control after it is lost", severity: "AUTO_FAIL" },
]);

test("bot initializes its Discord client and persistent authorization database without connecting", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("../dist/bot.mjs", import.meta.url))], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      DISCORD_BOT_TOKEN: "test-token",
      ROBLOX_OPEN_CLOUD_API_KEY: "test-key",
      BOT_AUTH_DB_PATH: path.join(tmpdir(), `sgh-grade-test-${process.pid}.sqlite3`),
    },
    stdio: "pipe",
  });
});

test("corrects common typos, contractions, and spacing", () => {
  assert.equal(
    correctGradeMistakeGrammar("  didnt hold aura ,because teh suspect  "),
    "Didn't hold aura, because the suspect.",
  );
});

test("corrects sentence capitalization and modal phrases", () => {
  assert.equal(
    correctGradeMistakeGrammar("i should of seperated it. definately wasnt ready"),
    "I should have separated it. Definitely wasn't ready.",
  );
});

test("preserves ambiguous homophones and empty input", () => {
  assert.equal(correctGradeMistakeGrammar("its color and your badge"), "Its color and your badge.");
  assert.equal(correctGradeMistakeGrammar(" \t "), "");
});

test("standardizes CBRN report phrasing", () => {
  assert.equal(correctGradeMistakeGrammar("Fail to enforce kz in office."), "Failed to enforce KZ in the office.");
});

test("capitalizes shortened grading terms that are not ordinary words", () => {
  assert.equal(
    correctGradeMistakeGrammar("did vb and pb wrong with oos and sfl"),
    "Did VB and PB wrong with OOS and SFL.",
  );
  assert.equal(
    correctGradeMistakeGrammar("enforced kz on sloth in dz"),
    "Enforced KZ on sloth in DZ.",
  );
  assert.equal(
    correctGradeMistakeGrammar("faced a wall while guarding the vip"),
    "Faced a wall while guarding the VIP.",
  );
});

test("keeps sheet-derived abbreviations across grading and hosting output", () => {
  const abbreviations = gradingAbbreviations(["Broke OOS.", "Did VB wrong.", "Enforced KZ in DZ."]);
  assert.deepEqual([...abbreviations].filter((term) => ["OOS", "VB", "KZ", "DZ"].includes(term)).sort(), ["DZ", "KZ", "OOS", "VB"]);
  assert.equal(
    capitalizeGradeAbbreviations("did vb in dz", abbreviations),
    "did VB in DZ",
  );

  const grade = calculateGrade(
    "broke oos\nforgot sfl\nenforced dz",
    rules,
    {},
    "Guarding Evaluation",
    {},
    abbreviations,
  );
  assert.deepEqual(grade.classified.map(({ mistake }) => mistake), [
    "Broke OOS.",
    "Forgot SFL.",
    "Enforced DZ.",
  ]);

  const hosting = calculateHostingGrade("broke oos", rules, {}, {}, abbreviations);
  assert.equal(hosting.classified[0].mistake, "Broke OOS.");
});

test("grammar correction does not change grade severity", () => {
  const grade = calculateGrade("Failure to aura from orbital/airstrike", rules);
  assert.equal(grade.score, 85);
  assert.deepEqual(grade.classified, [{ mistake: "Failure to aura from orbital/airstrike.", severity: "MAJOR", deduction: 15 }]);
});

test("classifies feedback using the cleaned grading data", () => {
  const grade = calculateGrade([
    "Didn't do SFL correctly.",
    "Failed to cuff vip to safety.",
    "Failure to aura from orbital/airstrike.",
  ].join("\n"), rules);
  assert.equal(grade.score, 70);
  assert.deepEqual(grade.classified, [
    { mistake: "Didn't do SFL correctly.", severity: "MINOR", deduction: 5 },
    { mistake: "Failed to cuff VIP to safety.", severity: "MODERATE", deduction: 10 },
    { mistake: "Failure to aura from orbital/airstrike.", severity: "MAJOR", deduction: 15 },
  ]);
});

test("uses the requested evaluation-specific pass marks", () => {
  assert.equal(gradePassThreshold("VIP Training"), 80);
  assert.equal(gradePassThreshold("Guarding Evaluation"), 70);
  assert.equal(gradePassThreshold("Hosting Evaluation"), 70);
  assert.throws(() => gradePassThreshold("Other"), /Invalid evaluation type/);
});

test("counts exact repeated guarding mistakes once and escalates at three", () => {
  const grade = calculateGrade([
    "Failure to obey a VIP order.",
    "Failure to obey a VIP order!",
    "Failure to obey a VIP order",
  ].join("\n"), rules);
  assert.equal(grade.score, 90);
  assert.deepEqual(grade.classified, [{
    mistake: "Failure to obey a VIP order.",
    severity: "MODERATE",
    occurrences: 3,
    deduction: 10,
  }]);
});

test("flags extreme guarding violations with a zero score", () => {
  const grade = calculateGrade("Terminating your own VIP", rules);
  assert.equal(grade.score, 0);
  assert.equal(grade.classified[0].severity, "EXTREME");
});

test("flags extreme VIP Training violations with a zero score", () => {
  const grade = calculateGrade("Terminating your own VIP", rules, {}, "VIP Training");
  assert.equal(grade.score, 0);
  assert.equal(grade.classified[0].severity, "EXTREME");
});

test("accepts EXTREME classifications for VIP Training", () => {
  assert.deepEqual(
    parseGradeCandidates(
      { classifications: [{ index: 0, severity: "EXTREME", duplicate_group: 0 }] },
      ["Terminating your own VIP."],
      "VIP Training",
    ),
    [{
      mistake: "Terminating your own VIP.",
      severity: "EXTREME",
      duplicateGroup: 0,
    }],
  );
});

test("applies hosting deductions and auto-fails to zero", () => {
  const hosting = calculateHostingGrade([
    "Failure to respond to PTS request",
    "Failure to respond to PTS request",
    "Failure to respond to PTS request",
  ].join("\n"), rules);
  assert.equal(hosting.score, 90);
  assert.deepEqual(hosting.classified, [{
    mistake: "Failure to respond to PTS request.",
    severity: "MODERATE",
    occurrences: 3,
    deduction: 10,
  }]);
  const autoFail = calculateHostingGrade("Failure to regain control after it is lost", rules);
  assert.equal(autoFail.score, 0);
  assert.equal(autoFail.autoFail, true);
});

test("escalates AI-grouped semantic repeats once and applies one deduction", () => {
  const grade = aggregateGradeCandidates("Guarding Evaluation", [
    { mistake: "Slow reaction to threat.", severity: "MINOR", duplicateGroup: 4 },
    { mistake: "Reacted slowly to the threat.", severity: "MINOR", duplicateGroup: 4 },
    { mistake: "Did not react promptly to threat.", severity: "MINOR", duplicateGroup: 4 },
  ]);
  assert.equal(grade.score, 90);
  assert.deepEqual(grade.classified, [{
    mistake: "Slow reaction to threat.",
    severity: "MODERATE",
    occurrences: 3,
    deduction: 10,
  }]);
});

test("parses Workers AI JSON-mode object responses and JSON strings", () => {
  const mistakes = ["Failure to obey a VIP order."];
  const response = { classifications: [{ index: 0, severity: "MINOR", duplicate_group: 0 }] };
  assert.deepEqual(parseGradeCandidates(response, mistakes, "Guarding Evaluation"), [{
    mistake: mistakes[0],
    severity: "MINOR",
    duplicateGroup: 0,
  }]);
  assert.deepEqual(parseGradeCandidates(JSON.stringify(response), mistakes, "Guarding Evaluation"), [{
    mistake: mistakes[0],
    severity: "MINOR",
    duplicateGroup: 0,
  }]);
  assert.throws(() => parseGradeCandidates({ response }, mistakes, "Guarding Evaluation"), /invalid response/);
});

test("cleans grammar and VIP capitalization in AI-graded feedback without changing severity", () => {
  const mistakes = [
    "didnt hold aura",
    "lost track of vip couple of times",
    "some positioning mishaps",
    "failure to cuff vip away from danger zone",
  ];
  const candidates = parseGradeCandidates({
    classifications: mistakes.map((_mistake, index) => ({
      index,
      severity: index === 3 ? "MAJOR" : "MINOR",
      duplicate_group: index,
    })),
  }, mistakes, "VIP Training");
  assert.deepEqual(candidates.map(({ mistake }) => mistake), [
    "Didn't hold aura.",
    "Lost track of VIP couple of times.",
    "Some positioning mishaps.",
    "Failure to cuff VIP away from danger zone.",
  ]);
  assert.deepEqual(candidates.map(({ severity }) => severity), ["MINOR", "MINOR", "MINOR", "MAJOR"]);
});

test("applies saved corrections only to the exact normalized mistake", () => {
  const mistake = "Didn't do SFL correctly.";
  const grade = calculateGrade(
    `${mistake}\nSome positioning mishaps.`,
    rules,
    { [normalizeGradeText(mistake)]: "MAJOR" },
  );
  assert.equal(grade.score, 75);
  assert.deepEqual(grade.classified, [
    { mistake: "Didn't do SFL correctly.", severity: "MAJOR", deduction: 15 },
    { mistake: "Some positioning mishaps.", severity: "MODERATE", deduction: 10 },
  ]);
});

test("parses severity-tagged rules from Google Sheets column B", () => {
  assert.deepEqual(parseGradeSheetCsv(
    ',USERNAME\r\n,\r\n,\r\n,"[-] Broke OOS. - MODERATE"\r\n,"[-] Failure to aura. - MAJOR"\r\n',
  ), [
    { mistake: "Broke OOS.", severity: "MODERATE" },
    { mistake: "Failure to aura.", severity: "MAJOR" },
  ]);
  assert.deepEqual(parseGradeSheetCsv(""), []);
  assert.throws(() => parseGradeSheetCsv(',USERNAME\n,\n,\n,"Broke OOS - MODERATE"'), /DATA!B4/);
  assert.throws(() => parseGradeSheetCsv(',USERNAME\n,\n,\n,"[-] Broke OOS - MODERATE"\n,"[-] Broke OOS - MAJOR"'), /conflicting severity/);
});

test("notifies after Google Sheets rules are cached, but not on cache hits", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(',USERNAME\n,\n,\n,"[-] Broke OOS. - MODERATE"\n');
  let notifications = 0;
  try {
    const loadedRules = await fetchGradeSheetRules(async (rules) => {
      notifications += 1;
      assert.deepEqual(rules, [{ mistake: "Broke OOS.", severity: "MODERATE" }]);
    });
    const cachedRules = await fetchGradeSheetRules(async () => {
      notifications += 1;
    });

    assert.deepEqual(cachedRules, loadedRules);
    assert.equal(notifications, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the paste-ready sheet copy contains the complete rubric", () => {
  const lines = readFileSync(new URL("./data/grade_mistakes_sheet.txt", import.meta.url), "utf8").trimEnd().split(/\r?\n/);
  const csv = [",USERNAME", ",", ",", ...lines.map((line) => `,"${line.replaceAll('"', '""')}"`)].join("\n");
  const rules = parseGradeSheetCsv(csv);
  assert.equal(rules.length, 432);
  assert.ok(rules.some(({ mistake, severity }) => mistake === "Terminating your own VIP." && severity === "EXTREME"));
  assert.ok(rules.some(({ mistake, severity }) => mistake === "Failure to regain control after it is lost." && severity === "EXTREME"));
});

test("sheet grading entries enforce exact severity overrides", () => {
  const sheetRules = [{ mistake: "Failure to obey a VIP order", severity: "MAJOR" }];
  const sheetGradeRules = createGradeRules(sheetRules);
  const grade = calculateGrade(
    "Failure to obey a VIP order",
    sheetGradeRules,
    gradeSheetSeverityOverrides(sheetRules, "Guarding Evaluation"),
  );
  assert.equal(grade.score, 85);
  assert.equal(grade.classified[0].severity, "MAJOR");
  assert.deepEqual(
    gradeSheetSeverityOverrides([{ mistake: "Could not regain control.", severity: "AUTO_FAIL" }], "Guarding Evaluation"),
    {},
  );
  assert.deepEqual(
    gradeSheetSeverityOverrides([{ mistake: "Terminating your own VIP", severity: "EXTREME" }], "VIP Training"),
    { "terminating your own vip": "EXTREME" },
  );
});

test("detects when the rubric already covers a submission", () => {
  const sheetRules = [
    { mistake: "Failure to obey a VIP order", severity: "MINOR" },
    { mistake: "Terminating your own VIP", severity: "EXTREME" },
    { mistake: "Failure to regain control after it is lost", severity: "AUTO_FAIL" },
  ];
  assert.equal(mistakeMatchesSheetRule("Failure to obey a VIP order was observed.", sheetRules, "Guarding Evaluation"), true);
  assert.equal(mistakeMatchesSheetRule("confiscated the vip's gun", sheetRules, "Guarding Evaluation"), false);
  assert.equal(mistakeMatchesSheetRule("Terminating your own VIP", sheetRules, "VIP Training"), true);
  assert.equal(mistakeMatchesSheetRule("Failure to regain control after it is lost", sheetRules, "Guarding Evaluation"), false);
  assert.equal(mistakeMatchesSheetRule("Failure to regain control after it is lost", sheetRules, "Hosting Evaluation"), true);
});

test("formats feedback as severity-colored Discord ANSI text", () => {
  const feedback = formatGradeFeedback([
    { mistake: "Minor note.", severity: "MINOR" },
    { mistake: "Another minor.", severity: "MINOR" },
    { mistake: "Moderate note.", severity: "MODERATE" },
    { mistake: "Major note.", severity: "MAJOR" },
    { mistake: "Extreme note.", severity: "EXTREME" },
  ]);
  assert.deepEqual(feedback, [
    "```ansi",
    "\u001b[38;2;64;222;64m[-] Minor note. - MINOR",
    "[-] Another minor. - MINOR",
    "\u001b[0m\u001b[38;2;255;249;0m[-] Moderate note. - MODERATE",
    "\u001b[0m\u001b[38;2;222;64;64m[-] Major note. - MAJOR",
    "\u001b[0m\u001b[38;2;222;64;64m[-] Extreme note. - EXTREME\u001b[0m",
    "```",
  ]);
  assert.doesNotMatch(feedback.join("\n"), /DIVISIONAL/i);
  assert.deepEqual(formatGradeFeedback([]), []);
});
