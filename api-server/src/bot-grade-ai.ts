import { normalizeGradeText, type GradeSeverity } from "./bot-grade";
import type { SheetGradeRule } from "./grade-sheet";

export interface GradeMistakeSuggestion {
  mistake: string;
  severity: GradeSeverity;
  reason: string;
}

export interface GradeReviewItem {
  original: string;
  index: number;
  correctedText: string;
  rubricMistake: string;
  severity: GradeSeverity;
  reason: string;
}

const allowedSeverities: Record<string, ReadonlySet<GradeSeverity>> = {
  "VIP Training": new Set(["MINOR", "MODERATE", "MAJOR", "EXTREME"]),
  "Guarding Evaluation": new Set(["MINOR", "MODERATE", "MAJOR", "EXTREME"]),
  "Hosting Evaluation": new Set(["MINOR", "MODERATE", "AUTO_FAIL"]),
};

// Schema-constrained decoding keeps a small local model on the exact response
// shape the parsers below expect. Loose JSON mode lets it drift into prose, echo
// the prompt, or turn the example values into the answer. Pinning the array
// length also stops it from silently dropping submissions it was asked to review.
function gradeReviewSchema(count: number): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      reviews: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            candidate: { type: "integer" },
            corrected: { type: "string" },
          },
          required: ["index", "candidate", "corrected"],
          additionalProperties: false,
        },
      },
    },
    required: ["reviews"],
    additionalProperties: false,
  };
}

function gradeSuggestionSchema(eventType: string): Record<string, unknown> {
  const severities = allowedSeverities[eventType];
  return {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source_index: { type: "integer" },
            mistake: { type: "string" },
            severity: severities ? { type: "string", enum: [...severities] } : { type: "string" },
            reason: { type: "string" },
          },
          required: ["source_index", "mistake", "severity", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: false,
  };
}

export function parseGradeMistakeSuggestions(
  response: unknown,
  mistakes: string[],
  eventType: string,
  knownRules: string[],
): GradeMistakeSuggestion[] {
  let parsed = response;
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response) as unknown;
    } catch (error) {
      throw new Error(`Local grading model returned invalid JSON: ${error instanceof Error ? error.message : "invalid output"}`);
    }
  }
  if (!parsed || typeof parsed !== "object" || !("suggestions" in parsed)) {
    throw new Error("Local grading model returned an invalid suggestion response.");
  }
  const suggestions = (parsed as { suggestions?: unknown }).suggestions;
  const severities = allowedSeverities[eventType];
  if (!Array.isArray(suggestions) || !severities) {
    throw new Error("Local grading model returned an invalid suggestion list or event type.");
  }

  const known = new Set(knownRules.map(normalizeGradeText));
  const seen = new Set<string>();
  const output: GradeMistakeSuggestion[] = [];
  for (const item of suggestions.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { source_index?: unknown; mistake?: unknown; severity?: unknown; reason?: unknown };
    const severity = typeof candidate.severity === "string" ? candidate.severity.toUpperCase() : "";
    if (!Number.isInteger(candidate.source_index) || (candidate.source_index as number) < 0
      || (candidate.source_index as number) >= mistakes.length
      || typeof candidate.mistake !== "string"
      || !severities.has(severity as GradeSeverity)) continue;

    const mistake = candidate.mistake.replace(/\s+/g, " ").trim().replace(/^[-•]\s*/, "");
    const normalized = normalizeGradeText(mistake);
    if (!normalized || mistake.length > 240 || known.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push({
      mistake,
      severity: severity as GradeSeverity,
      reason: typeof candidate.reason === "string" ? candidate.reason.replace(/\s+/g, " ").trim().slice(0, 240) : "",
    });
  }
  return output;
}

const SAFE_CORRECTION_TOKEN_OVERLAP = 0.5;
const RUBRIC_MATCH_MIN_OVERLAP = 0.6;

function usableSeverity(severity: GradeSeverity, eventType: string): boolean {
  if (eventType === "Hosting Evaluation") return severity === "MINOR" || severity === "MODERATE" || severity === "AUTO_FAIL";
  if (eventType === "VIP Training") return severity === "MINOR" || severity === "MODERATE" || severity === "MAJOR" || severity === "EXTREME";
  return severity !== "AUTO_FAIL";
}

function significantTokens(text: string): Set<string> {
  return new Set(normalizeGradeText(text).split(" ").filter((token) => token.length > 2));
}

function overlapRatio(source: Set<string>, target: Set<string>): number {
  if (!source.size) return 0;
  let shared = 0;
  for (const token of source) if (target.has(token)) shared += 1;
  return shared / source.size;
}

// A small local model often forces a match it cannot justify. Requiring real word
// overlap with the chosen rubric entry blocks those guesses while still allowing
// reworded submissions (e.g. "didn't secure the lobby" -> "Failure to secure the lobby").
function rubricMatchIsPlausible(original: string, rule: string): boolean {
  const submissionTokens = significantTokens(original);
  const ruleTokens = significantTokens(rule);
  return overlapRatio(submissionTokens, ruleTokens) >= RUBRIC_MATCH_MIN_OVERLAP
    && overlapRatio(ruleTokens, submissionTokens) >= RUBRIC_MATCH_MIN_OVERLAP;
}

const CANDIDATE_MIN_OVERLAP = 0.5;
const MAX_CANDIDATES_PER_MISTAKE = 5;

export function candidateRulesFor(mistake: string, sheetRules: SheetGradeRule[], eventType: string): SheetGradeRule[] {
  const usableRules = sheetRules.filter((rule) => usableSeverity(rule.severity, eventType));
  const tokens = significantTokens(mistake);
  if (!tokens.size) return [];
  return usableRules
    .map((rule) => {
      const ruleTokens = significantTokens(rule.mistake);
      return { rule, score: Math.max(overlapRatio(tokens, ruleTokens), overlapRatio(ruleTokens, tokens)) };
    })
    .filter(({ score }) => score >= CANDIDATE_MIN_OVERLAP)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES_PER_MISTAKE)
    .map(({ rule }) => rule);
}

function isSafeCorrection(original: string, corrected: string): boolean {
  const clean = corrected.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 300 || /[\r\n]/.test(corrected)) return false;
  const ratio = clean.length / Math.max(1, original.length);
  if (ratio < 0.5 || ratio > 1.8) return false;
  const originalTokens = significantTokens(original);
  if (!originalTokens.size) return false;
  return overlapRatio(originalTokens, significantTokens(clean)) >= SAFE_CORRECTION_TOKEN_OVERLAP;
}

export function parseGradeReview(
  response: unknown,
  mistakes: string[],
  eventType: string,
  sheetRules: SheetGradeRule[],
): GradeReviewItem[] {
  let parsed = response;
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response) as unknown;
    } catch (error) {
      throw new Error(`Local grading model returned invalid JSON: ${error instanceof Error ? error.message : "invalid output"}`);
    }
  }
  if (!parsed || typeof parsed !== "object" || !("reviews" in parsed)) {
    throw new Error("Local grading model returned an invalid review response.");
  }
  const reviews = (parsed as { reviews?: unknown }).reviews;
  if (!Array.isArray(reviews)) {
    throw new Error("Local grading model returned an invalid review list.");
  }

  const usableRules = sheetRules.filter((rule) => usableSeverity(rule.severity, eventType));
  const rubric = new Map<string, { mistake: string; severity: GradeSeverity }>();
  for (const rule of usableRules) rubric.set(normalizeGradeText(rule.mistake), rule);

  const seen = new Set<number>();
  const output: GradeReviewItem[] = [];
  for (const item of reviews.slice(0, mistakes.length)) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { index?: unknown; candidate?: unknown; rule?: unknown; rubric?: unknown; corrected?: unknown; reason?: unknown };
    const index = candidate.index;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= mistakes.length || seen.has(index as number)) continue;

    const original = mistakes[index as number]!;
    const candidates = candidateRulesFor(original, sheetRules, eventType);
    const candidateNumber = Number(candidate.candidate);
    const picked = Number.isInteger(candidateNumber) && candidateNumber >= 1 && candidateNumber <= candidates.length
      ? candidates[candidateNumber - 1]
      : undefined;
    const ruleNumber = Number(candidate.rule);
    const numbered = Number.isInteger(ruleNumber) && ruleNumber >= 1 && ruleNumber <= usableRules.length
      ? usableRules[ruleNumber - 1]
      : undefined;
    const matched = picked ?? numbered
      ?? (typeof candidate.rubric === "string" ? rubric.get(normalizeGradeText(candidate.rubric)) : undefined);
    if (!matched) continue;
    if (!rubricMatchIsPlausible(original, matched.mistake)) continue;

    seen.add(index as number);
    const corrected = typeof candidate.corrected === "string" ? candidate.corrected.replace(/\s+/g, " ").trim() : "";
    const grammarFix = corrected
      && normalizeGradeText(corrected) !== normalizeGradeText(matched.mistake)
      && isSafeCorrection(original, corrected)
      ? corrected
      : "";
    output.push({
      original,
      index: index as number,
      correctedText: grammarFix,
      rubricMistake: matched.mistake,
      severity: matched.severity,
      reason: typeof candidate.reason === "string" ? candidate.reason.replace(/\s+/g, " ").trim().slice(0, 240) : "",
    });
  }
  return output;
}

export async function reviewGradeSubmission({
  eventType,
  mistakesText,
  sheetRules,
  baseUrl,
  model,
  signal,
}: {
  eventType: string;
  mistakesText: string;
  sheetRules: SheetGradeRule[];
  baseUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<GradeReviewItem[]> {
  const mistakes = mistakesText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\[-\]|\[\+\]|[-+•])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 25);
  if (!mistakes.length) return [];

  const items = mistakes.flatMap((text, index) => {
    const candidates = candidateRulesFor(text, sheetRules, eventType);
    if (!candidates.length) return [];
    return [{
      index,
      text: text.slice(0, 300),
      candidates: candidates.map((rule, candidateIndex) => ({
        candidate: candidateIndex + 1,
        text: rule.mistake.slice(0, 240),
      })),
    }];
  });
  if (!items.length) return [];

  const endpoint = new URL("/api/chat", baseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
    throw new Error("Grading AI must use a local Ollama address (localhost or loopback).");
  }

  const REQUEST_TIMEOUT_MS = 60_000;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      stream: false,
      format: gradeReviewSchema(items.length),
      think: false,
      keep_alive: "5m",
      options: { temperature: 0, num_predict: 1200 },
      messages: [
        {
          role: "system",
          content: "For each submission, choose the numbered candidate whose meaning genuinely covers it, or 0 if none does. Never force a match. Also fix spelling, grammar, capitalization, and punctuation in the submission without changing its meaning. Return JSON only: {\"reviews\":[{\"index\":0,\"candidate\":0,\"corrected\":\"corrected sentence ending with a period\"}]}. Use every listed index exactly once. Do not invent mistakes, people, events, or evaluation types.",
        },
        {
          role: "user",
          content: JSON.stringify({ event_type: eventType, items }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Local grading model returned HTTP ${response.status}.`);
  const payload = await response.json() as { message?: { content?: unknown } };
  if (typeof payload.message?.content !== "string") throw new Error("Local grading model response did not contain text.");
  return parseGradeReview(payload.message.content, mistakes, eventType, sheetRules);
}

export async function suggestNewGradeMistakes({
  eventType,
  mistakes,
  knownRules,
  baseUrl,
  model,
  signal,
}: {
  eventType: string;
  mistakes: string[];
  knownRules: string[];
  baseUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<GradeMistakeSuggestion[]> {
  if (!mistakes.length) return [];
  const endpoint = new URL("/api/chat", baseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
    throw new Error("Grading AI must use a local Ollama address (localhost or loopback).");
  }

  const REQUEST_TIMEOUT_MS = 60_000;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      stream: false,
      format: gradeSuggestionSchema(eventType),
      think: false,
      keep_alive: "5m",
      options: { temperature: 0, num_predict: 400 },
      messages: [
        {
          role: "system",
          content: "Review evaluation feedback for genuinely new, reusable grading mistakes. Compare each submitted item with the existing rubric and suggest only distinct behaviors not already covered. Do not invent events or people. Return JSON only: {\"suggestions\":[{\"source_index\":0,\"mistake\":\"concise reusable rule\",\"severity\":\"MINOR|MODERATE|MAJOR|EXTREME|AUTO_FAIL\",\"reason\":\"brief explanation\"}]}. source_index is zero-based. Return at most 5 suggestions. If none are clearly new, return {\"suggestions\":[]}. Severity must fit the given evaluation type.",
        },
        {
          role: "user",
          content: JSON.stringify({
            event_type: eventType,
            submitted_mistakes: mistakes.slice(0, 40).map((mistake) => mistake.slice(0, 300)),
            existing_rubric: knownRules.slice(0, 100).map((rule) => rule.slice(0, 240)),
          }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Local grading model returned HTTP ${response.status}.`);
  const payload = await response.json() as { message?: { content?: unknown } };
  if (typeof payload.message?.content !== "string") throw new Error("Local grading model response did not contain text.");
  return parseGradeMistakeSuggestions(payload.message.content, mistakes, eventType, knownRules);
}
