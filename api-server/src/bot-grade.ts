const grammarWords: Record<string, string> = {
  aint: "ain't", arent: "aren't", cant: "can't", coulda: "could've", couldnt: "couldn't", didnt: "didn't", doesnt: "doesn't", dont: "don't",
  im: "I'm", ive: "I've", hadnt: "hadn't", hasnt: "hasn't", havent: "haven't", isnt: "isn't", mightnt: "mightn't", mustnt: "mustn't",
  shoulda: "should've", shouldnt: "shouldn't", wasnt: "wasn't", weve: "we've", wont: "won't", woulda: "would've", wouldnt: "wouldn't",
  youre: "you're", youve: "you've", theyre: "they're", theyve: "they've", alot: "a lot", beacuse: "because", becuase: "because",
  definately: "definitely", occured: "occurred", recieve: "receive", seperate: "separate", seperated: "separated", teh: "the", untill: "until", wich: "which",
};

function preserveCase(original: string, replacement: string): string {
  if (original.toUpperCase() === original) return replacement.toUpperCase();
  if (original[0]?.toUpperCase() === original[0]) return replacement[0]!.toUpperCase() + replacement.slice(1);
  return replacement;
}

// Shortened report terms that are not ordinary English words. Everything here is
// normalized to uppercase so feedback stays consistent for the Google Sheet.
const GRADING_ABBREVIATIONS = new Set([
  "AFK", "BO", "CBRN", "CCTV", "CG", "CLR", "CR", "DSL", "DZ", "FT", "IV", "KOS", "KZ", "LC",
  "LWR", "MP", "OOS", "OS", "PB", "PM", "PTFI", "PTS", "RA", "RET", "RPG", "SFL", "SPC", "SPY", "SS",
  "STS", "UL", "VB", "VIP",
]);

// Uppercase words that appear in the sheet but are ordinary words or names, not
// abbreviations. They must never be uppercased just because of how the sheet wrote them.
const ABBREVIATION_WORD_BLOCKLIST = new Set([
  "WALL", "WING", "WEDGE", "GUARD", "MOON", "SLOTH", "TEMP", "NON", "MAN", "LEFT", "KANE",
  "KARIMO", "AYU", "BEFORE", "DATA", "EXTREME", "INPUT", "MAJOR", "MINOR", "MISTAKE", "NONE",
  "USER", "HOST", "PASS", "FAIL", "AND", "THE", "YOU", "NOT", "WITH",
]);

function isLikelyGradeAbbreviation(token: string): boolean {
  if (!/^[A-Z]{2,7}$/.test(token)) return false;
  if (GRADING_ABBREVIATIONS.has(token)) return true;
  if (ABBREVIATION_WORD_BLOCKLIST.has(token)) return false;
  // A short word with no vowels (and no "y", which commonly stands in for one)
  // is almost never an ordinary word, so it is safe to treat as an abbreviation.
  return !/[AEIOUY]/.test(token);
}

// Adds sheet-derived abbreviations to the curated set. The conservative shape
// check above keeps ordinary words and proper nouns in the sheet untouched.
export function gradingAbbreviations(texts: Iterable<string> = []): Set<string> {
  const abbreviations = new Set(GRADING_ABBREVIATIONS);
  for (const text of texts) {
    for (const token of text.match(/[A-Za-z]{2,7}/g) ?? []) {
      const upper = token.toUpperCase();
      if (isLikelyGradeAbbreviation(upper)) abbreviations.add(upper);
    }
  }
  return abbreviations;
}

export function capitalizeGradeAbbreviations(
  text: string,
  abbreviations: Iterable<string> = GRADING_ABBREVIATIONS,
): string {
  const known = abbreviations instanceof Set ? abbreviations : new Set(abbreviations);
  return text.replace(/\b[A-Za-z]{2,7}\b/g, (token) => {
    const upper = token.toUpperCase();
    return known.has(upper) || isLikelyGradeAbbreviation(upper) ? upper : token;
  });
}

export function correctGradeMistakeGrammar(
  text: string,
  abbreviations: Iterable<string> = GRADING_ABBREVIATIONS,
): string {
  let result = text.replace(/[’‘]/g, "'").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  for (const [incorrect, replacement] of Object.entries({ "could of": "could have", "should of": "should have", "would of": "would have" })) {
    result = result.replace(new RegExp(`\\b${incorrect}\\b`, "gi"), (match) => preserveCase(match, replacement));
  }
  for (const [incorrect, replacement] of Object.entries(grammarWords)) {
    result = result.replace(new RegExp(`\\b${incorrect}\\b`, "gi"), (match) => preserveCase(match, replacement));
  }
  result = result.replace(/(^|[.!?]\s+)(fail)\s+to\b/gi, (_m, prefix: string, fail: string) => `${prefix}${preserveCase(fail, "failed")} to`);
  result = result.replace(/\b(kz)\s+in\s+(?:the\s+)?office\b/gi, (_m, kz: string) => `${kz} in the office`);
  result = capitalizeGradeAbbreviations(result, abbreviations);
  return result.replace(/\bi\b/gi, "I").replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:!?])(?=[A-Za-z0-9])/g, "$1 ")
    .replace(/([.!?])(?=[A-Za-z])/g, "$1 ").replace(/([!?])\1{2,}/g, "$1")
    .replace(/(^|[.!?]\s+)(["'“‘(\[]*)(\s*)([a-z])/g, (_m, prefix: string, quote: string, space: string, first: string) => `${prefix}${quote}${space}${first.toUpperCase()}`)
    .replace(/[^.!?]$/, (ending) => `${ending}.`);
}

export function normalizeGradeText(text: string): string {
  return text.toLocaleLowerCase().replaceAll("’", "'").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export type GradeSeverity = "MINOR" | "MODERATE" | "MAJOR" | "EXTREME" | "AUTO_FAIL";

const GRADE_ANSI_COLORS: Record<GradeSeverity, string> = {
  MINOR: "\u001b[38;2;64;222;64m",
  MODERATE: "\u001b[38;2;255;249;0m",
  MAJOR: "\u001b[38;2;222;64;64m",
  EXTREME: "\u001b[38;2;222;64;64m",
  AUTO_FAIL: "\u001b[38;2;222;64;64m",
};

export interface ClassifiedMistake {
  mistake: string;
  severity: GradeSeverity;
  occurrences?: number;
  deduction?: 5 | 10 | 15;
}

export interface GradeAssessment {
  score: number;
  classified: ClassifiedMistake[];
  autoFail: boolean;
}

export interface GradeCandidate {
  mistake: string;
  severity: GradeSeverity;
  duplicateGroup: number;
}

export function parseGradeCandidates(
  response: unknown,
  mistakes: string[],
  eventType: string,
  severityOverrides: Record<string, GradeSeverity> = {},
  abbreviations: Iterable<string> = GRADING_ABBREVIATIONS,
): GradeCandidate[] {
  let parsed: unknown = response;
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response) as unknown;
    } catch (error) {
      throw new Error(`The grading model did not return valid JSON: ${error instanceof Error ? error.message : "invalid output"}`);
    }
  }
  if (!parsed || typeof parsed !== "object" || !("classifications" in parsed)) {
    throw new Error("The grading model returned an invalid response.");
  }
  const classifications = (parsed as { classifications?: unknown }).classifications;
  if (!Array.isArray(classifications) || classifications.length !== mistakes.length) {
    throw new Error("The grading model did not classify every submitted mistake.");
  }
  const allowedSeverities = eventType === "Hosting Evaluation"
    ? new Set(["MINOR", "MODERATE", "AUTO_FAIL"])
    : new Set(["MINOR", "MODERATE", "MAJOR", "EXTREME"]);
  const seenIndexes = new Set<number>();
  return classifications.map((item, position) => {
    if (!item || typeof item !== "object") throw new Error("The grading model returned a malformed classification.");
    const candidate = item as { index?: unknown; severity?: unknown; duplicate_group?: unknown };
    const { index, severity, duplicate_group: duplicateGroup } = candidate;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= mistakes.length
      || seenIndexes.has(index as number) || typeof duplicateGroup !== "number"
      || !Number.isInteger(duplicateGroup) || duplicateGroup < 0
      || typeof severity !== "string" || !allowedSeverities.has(severity)) {
      throw new Error(`The grading model returned an invalid classification for item ${position + 1}.`);
    }
    seenIndexes.add(index as number);
    const mistake = mistakes[index as number]!;
    const correction = severityOverrides[normalizeGradeText(mistake)];
    const finalSeverity = correction && allowedSeverities.has(correction) ? correction : severity;
    return {
      mistake: correctGradeMistakeGrammar(mistake, abbreviations),
      severity: finalSeverity as GradeSeverity,
      duplicateGroup: eventType === "VIP Training" ? index as number : duplicateGroup,
    };
  });
}

export function aggregateGradeCandidates(eventType: string, candidates: GradeCandidate[]): GradeAssessment {
  const isGuarding = eventType === "Guarding Evaluation";
  const isHosting = eventType === "Hosting Evaluation";
  if (!isHosting && !isGuarding && eventType !== "VIP Training") {
    throw new Error("Invalid evaluation type.");
  }
  const grouped = new Map<number, GradeCandidate[]>();
  for (const candidate of candidates) {
    const group = grouped.get(candidate.duplicateGroup) ?? [];
    group.push(candidate);
    grouped.set(candidate.duplicateGroup, group);
  }

  const classified: ClassifiedMistake[] = [];
  let autoFail = false;
  let extremeViolation = false;
  let deductions = 0;
  const guardingOrder: GradeSeverity[] = ["MINOR", "MODERATE", "MAJOR", "EXTREME"];
  for (const group of grouped.values()) {
    const occurrences = group.length;
    let severity = group.reduce((highest, item) => {
      if (item.severity === "AUTO_FAIL") return "AUTO_FAIL";
      if (highest === "AUTO_FAIL") return highest;
      const order = isHosting ? ["MINOR", "MODERATE"] : guardingOrder;
      return order.indexOf(item.severity) > order.indexOf(highest) ? item.severity : highest;
    }, group[0]!.severity);

    if ((isGuarding || isHosting) && occurrences >= 3 && severity !== "AUTO_FAIL") {
      if (isHosting) {
        if (severity === "MINOR") severity = "MODERATE";
      } else {
        const index = guardingOrder.indexOf(severity);
        severity = guardingOrder[Math.min(index + 1, guardingOrder.length - 1)]!;
      }
    }

    const deduction = isHosting
      ? severity === "MINOR" ? 5 : severity === "MODERATE" ? 10 : undefined
      : severity === "MINOR" ? 5 : severity === "MODERATE" ? 10 : severity === "MAJOR" ? 15 : undefined;
    if (severity === "AUTO_FAIL") autoFail = true;
    if (severity === "EXTREME") extremeViolation = true;
    if (deduction !== undefined) deductions += deduction;
    classified.push({
      mistake: group[0]!.mistake,
      severity,
      ...(occurrences > 1 ? { occurrences } : {}),
      ...(deduction !== undefined ? { deduction } : {}),
    });
  }

  return {
    score: autoFail || extremeViolation ? 0 : Math.max(0, 100 - deductions),
    classified,
    autoFail,
  };
}

export function formatGradeFeedback(classified: ClassifiedMistake[]): string[] {
  if (!classified.length) return [];

  const lines = ["```ansi"];
  let previousSeverity: GradeSeverity | undefined;
  for (const item of classified) {
    const color = previousSeverity === item.severity ? "" : `${previousSeverity ? "\u001b[0m" : ""}${GRADE_ANSI_COLORS[item.severity]}`;
    const mistake = item.mistake.replace(/[\u0000-\u001f\u007f]/g, "");
    const repeated = item.occurrences && item.occurrences > 1 ? ` (repeated ${item.occurrences}x; counted once)` : "";
    const outcome = item.severity === "EXTREME"
      ? "EXTREME"
      : item.severity === "AUTO_FAIL"
        ? "AUTO FAIL"
        : `${item.severity}${item.deduction === undefined ? "" : ` (-${item.deduction}%)`}`;
    lines.push(`${color}[-] ${mistake.replace(/[ .!?]+$/, "")}${repeated}. - ${outcome}`);
    previousSeverity = item.severity;
  }
  lines[lines.length - 1] += "\u001b[0m";
  lines.push("```");
  return lines;
}

export function gradePassThreshold(eventType: string): number {
  if (eventType === "VIP Training") return 80;
  if (eventType === "Guarding Evaluation" || eventType === "Hosting Evaluation") return 70;
  throw new Error("Invalid evaluation type.");
}

export function calculateGrade(
  mistakesText: string,
  rules: Record<string, unknown>,
  severityOverrides: Record<string, GradeSeverity> = {},
  eventType: "VIP Training" | "Guarding Evaluation" = "Guarding Evaluation",
  grammarOverrides: Record<string, string> = {},
  abbreviations: Iterable<string> = GRADING_ABBREVIATIONS,
): GradeAssessment {
  const knownAbbreviations = abbreviations instanceof Set ? abbreviations : new Set(abbreviations);
  const isGuarding = eventType === "Guarding Evaluation";
  const mistakes = mistakesText.split(/\r?\n/).map((line) => line.replace(/^\s*(?:\[-\]|\[\+\]|[-+•])\s*/, "").trim()).filter(Boolean);
  const normalizedRules = Object.fromEntries(
    ["extreme", "major", "moderate", "minor"].map((severity) => {
      const phrases = rules[severity];
      const examples = isGuarding ? rules[`${severity}_examples`] : undefined;
      const validPhrases = (value: unknown): value is string[] =>
        Array.isArray(value) && value.every((phrase) => typeof phrase === "string" && Boolean(phrase.trim()));
      if (!validPhrases(phrases) || (examples !== undefined && !validPhrases(examples))) {
        throw new Error(`The grading rules file has invalid '${severity}' phrases or examples.`);
      }
      const phraseList = [
        ...phrases,
        ...(validPhrases(examples) ? examples : []),
      ];
      return [severity.toUpperCase(), phraseList.map(normalizeGradeText)];
    }),
  ) as Record<string, string[]>;
  const duplicateGroups = new Map<string, number>();
  for (const [index, mistake] of mistakes.entries()) {
    const normalized = normalizeGradeText(mistake);
    if (eventType === "VIP Training") duplicateGroups.set(`${normalized}:${index}`, duplicateGroups.size);
    else if (!duplicateGroups.has(normalized)) duplicateGroups.set(normalized, duplicateGroups.size);
  }
  const candidates = mistakes.map((mistake, index) => {
    const normalized = normalizeGradeText(mistake);
    const severity = severityOverrides[normalized] ?? (["EXTREME", "MAJOR", "MODERATE", "MINOR"] as const).find((key) => normalizedRules[key]!.some((phrase) => (
      new RegExp(`(?<![a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(normalized)
    ))) ?? "MODERATE";
    const duplicateKey = eventType === "VIP Training" ? `${normalized}:${index}` : normalized;
    return { mistake: grammarOverrides[normalized] ?? correctGradeMistakeGrammar(mistake, knownAbbreviations), severity, duplicateGroup: duplicateGroups.get(duplicateKey)! };
  });
  return aggregateGradeCandidates(eventType, candidates);
}

export function calculateHostingGrade(
  mistakesText: string,
  rules: Record<string, unknown>,
  severityOverrides: Record<string, GradeSeverity> = {},
  grammarOverrides: Record<string, string> = {},
  abbreviations: Iterable<string> = GRADING_ABBREVIATIONS,
): GradeAssessment {
  const knownAbbreviations = abbreviations instanceof Set ? abbreviations : new Set(abbreviations);
  const mistakes = mistakesText.split(/\r?\n/).map((line) => line.replace(/^\s*(?:\[-\]|\[\+\]|[-+•])\s*/, "").trim()).filter(Boolean);
  const hosting = rules.hosting as { minus_5?: unknown; minus_10?: unknown; auto_fail?: unknown } | undefined;
  const minus5 = hosting?.minus_5;
  const minus10 = hosting?.minus_10;
  const autoFail = hosting?.auto_fail;
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  if (!isStringArray(minus5) || !isStringArray(minus10) || !isStringArray(autoFail)) {
    throw new Error("The hosting grading rules are invalid.");
  }
  const candidates = mistakes.map((mistake) => {
    const normalized = normalizeGradeText(mistake);
    const matches = (phrases: string[]) => phrases.some((phrase) => {
      const normalizedPhrase = normalizeGradeText(phrase);
      return normalized.includes(normalizedPhrase);
    });
    const severity: GradeSeverity = (severityOverrides[normalized] === "MINOR" || severityOverrides[normalized] === "MODERATE" || severityOverrides[normalized] === "AUTO_FAIL")
      ? severityOverrides[normalized]!
      : matches(autoFail) ? "AUTO_FAIL"
      : matches(minus10) ? "MODERATE"
        : matches(minus5) ? "MINOR" : "MODERATE";
    return { mistake: grammarOverrides[normalized] ?? correctGradeMistakeGrammar(mistake, knownAbbreviations), severity, duplicateGroup: normalized };
  });
  const groupIndexes = new Map<string, number>();
  return aggregateGradeCandidates("Hosting Evaluation", candidates.map((candidate) => {
    let duplicateGroup = groupIndexes.get(candidate.duplicateGroup);
    if (duplicateGroup === undefined) {
      duplicateGroup = groupIndexes.size;
      groupIndexes.set(candidate.duplicateGroup, duplicateGroup);
    }
    return { ...candidate, duplicateGroup };
  }));
}
