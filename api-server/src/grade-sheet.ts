import { normalizeGradeText, type GradeSeverity } from "./bot-grade";

const SHEET_ID = "1jmYx72qIjSuTaZpcBPNj1GA2rdyZO3vT2NElOzP4ZOA";
const DATA_TAB_ID = "326747804";
const CACHE_DURATION_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const sheetUrl = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export`);
sheetUrl.searchParams.set("format", "csv");
sheetUrl.searchParams.set("gid", DATA_TAB_ID);

export interface SheetGradeRule {
  mistake: string;
  severity: GradeSeverity;
}

export function gradeSheetSeverityOverrides(
  sheetRules: SheetGradeRule[],
  eventType: string,
): Record<string, GradeSeverity> {
  return Object.fromEntries(sheetRules
    .filter(({ severity }) => severity !== "AUTO_FAIL" || eventType === "Hosting Evaluation")
    .map(({ mistake, severity }) => [normalizeGradeText(mistake), severity]));
}

function usableSheetRule(severity: GradeSeverity, eventType: string): boolean {
  if (eventType === "Hosting Evaluation") return severity === "MINOR" || severity === "MODERATE" || severity === "AUTO_FAIL";
  if (eventType === "VIP Training") return severity === "MINOR" || severity === "MODERATE" || severity === "MAJOR" || severity === "EXTREME";
  return severity !== "AUTO_FAIL";
}

export function mistakeMatchesSheetRule(
  mistake: string,
  sheetRules: SheetGradeRule[],
  eventType: string,
): boolean {
  const normalized = normalizeGradeText(mistake);
  if (!normalized) return false;
  return sheetRules.some(({ mistake: rule, severity }) => {
    if (!usableSheetRule(severity, eventType)) return false;
    const normalizedRule = normalizeGradeText(rule);
    if (!normalizedRule) return false;
    if (eventType === "Hosting Evaluation") return normalized.includes(normalizedRule);
    return new RegExp(`(?<![a-z0-9])${normalizedRule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(normalized);
  });
}

let cachedRules: SheetGradeRule[] | undefined;
let cacheExpiresAt = 0;
let pendingRequest: Promise<SheetGradeRule[]> | undefined;

export function parseGradeSheetCsv(csv: string): SheetGradeRule[] {
  const rows = parseCsv(csv);
  const entries: SheetGradeRule[] = [];
  const seen = new Map<string, GradeSeverity>();
  const severityByCell = new Map<string, GradeSeverity>([
    ["MINOR", "MINOR"],
    ["MODERATE", "MODERATE"],
    ["MAJOR", "MAJOR"],
    ["EXTREME", "EXTREME"],
    ["AUTO_FAIL", "AUTO_FAIL"],
  ]);

  rows.slice(3).forEach((row, index) => {
    const value = row[1]?.trim() ?? "";
    if (!value) return;
    const match = /^\s*\[-\]\s*(.*?)\s+-\s*(MINOR|MODERATE|MAJOR|EXTREME|AUTO_FAIL)\s*$/i.exec(value);
    if (!match || !match[1]?.trim()) {
      throw new Error(`DATA!B${index + 4} must use the format "[-] Error description. - MODERATE".`);
    }

    const mistake = match[1].trim();
    const severity = severityByCell.get(match[2]!.toUpperCase());
    if (!severity) throw new Error(`DATA!B${index + 4} has an unsupported severity.`);
    const normalized = normalizeGradeText(mistake);
    const previousSeverity = seen.get(normalized);
    if (previousSeverity && previousSeverity !== severity) {
      throw new Error(`DATA!B${index + 4} assigns a conflicting severity to "${mistake}".`);
    }
    if (previousSeverity) return;
    seen.set(normalized, severity);
    entries.push({ mistake, severity });
  });

  return entries;
}

export function createGradeRules(sheetRules: SheetGradeRule[]): Record<string, unknown> {
  const rules: Record<string, unknown> = {
    guarding_rubric: {
      minor: "Technical rule violations or small errors that do not significantly hinder guard duties.",
      moderate: "Errors that can cause genuine harm to the VIP or lead to their death.",
      major: "Errors that have a drastic chance of causing the VIP's death.",
      extreme: "Unacceptable punishable violations.",
    },
    minor: [],
    moderate: [],
    major: [],
    extreme: [],
    hosting: { minus_5: [], minus_10: [], auto_fail: [] },
  };
  const hosting = rules["hosting"] as Record<string, string[]>;

  for (const { mistake, severity } of sheetRules) {
    if (severity === "AUTO_FAIL") {
      hosting["auto_fail"]!.push(mistake);
      continue;
    }

    (rules[severity.toLowerCase()] as string[]).push(mistake);
    if (severity === "MINOR") hosting["minus_5"]!.push(mistake);
    if (severity === "MODERATE") hosting["minus_10"]!.push(mistake);
  }

  return rules;
}

export async function fetchGradeSheetRules(
  onCached?: (rules: SheetGradeRule[]) => Promise<void>,
): Promise<SheetGradeRule[]> {
  if (cachedRules && Date.now() < cacheExpiresAt) return cachedRules;
  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    try {
      const response = await fetch(sheetUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}.`);
      const csv = await response.text();
      if (csv.trimStart().startsWith("<")) throw new Error("Google Sheets returned HTML instead of CSV data.");
      const rules = parseGradeSheetCsv(csv);
      cachedRules = rules;
      cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
      if (onCached) {
        try {
          await onCached(rules);
        } catch (error) {
          console.error("[badge-grading] Unable to notify that Google Sheets grading rules were cached.", error);
        }
      }
      return rules;
    } catch (error) {
      if (cachedRules) {
        console.error("[badge-grading] Unable to refresh Google Sheets grading rules; using the last successful copy.", error);
        cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
        return cachedRules;
      }
      throw new Error(`Unable to load grading rules from DATA!B4:B: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      pendingRequest = undefined;
    }
  })();

  return pendingRequest;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Google Sheets returned malformed CSV data.");
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
