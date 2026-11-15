export interface AltAssessment {
  chance: number;
  reason: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REQUEST_TIMEOUT_MS = 15_000;

// Schema-constrained decoding stops a small model from answering in prose or
// echoing the prompt instead of returning the chance/reason object.
const altAssessmentSchema = {
  type: "object",
  properties: {
    chance: { type: "integer", minimum: 0, maximum: 100 },
    reason: { type: "string" },
  },
  required: ["chance", "reason"],
  additionalProperties: false,
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

export function parseAltAssessment(response: unknown): AltAssessment {
  let parsed = response;
  if (typeof response === "string") {
    try {
      parsed = JSON.parse(response) as unknown;
    } catch (error) {
      throw new Error(`Local alt-risk model returned invalid JSON: ${error instanceof Error ? error.message : "invalid output"}`);
    }
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Local alt-risk model returned an invalid response.");
  }
  const record = parsed as { chance?: unknown; reason?: unknown };
  const chance = typeof record.chance === "number" ? record.chance : Number(record.chance);
  if (!Number.isFinite(chance)) {
    throw new Error("Local alt-risk model did not return a numeric chance.");
  }
  return {
    chance: Math.round(Math.min(100, Math.max(0, chance))),
    reason: cleanText(record.reason, 240),
  };
}

export async function assessAltRisk({
  signals,
  baseUrl,
  model,
  signal,
}: {
  signals: Record<string, unknown>;
  baseUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<AltAssessment> {
  const endpoint = new URL("/api/chat", baseUrl);
  if (!LOOPBACK_HOSTS.has(endpoint.hostname)) {
    throw new Error("Alt-risk AI must use a local Ollama address (localhost or loopback).");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      stream: false,
      format: altAssessmentSchema,
      think: false,
      keep_alive: "5m",
      options: { temperature: 0, num_predict: 200 },
      messages: [
        {
          role: "system",
          content: "You estimate how likely a Roblox account is an alternate account (alt). Use only the supplied signals and do not invent data. Return JSON only: {\"chance\":0,\"reason\":\"...\"}. chance is an integer from 0 to 100. Write reason as a specific observation that cites concrete values from the signals; never restate these instructions. Raise it for very new accounts, few badges, few friends/followers/following, many past usernames, blacklist or secret-service records, little group history, few avatar items, few inventory items or game passes, no created or favourite games, and private inventory. Lower it for old accounts with many badges, friends, followers, groups, avatar items, inventory items, game passes, created games and favourite games, and clean records.",
        },
        {
          role: "user",
          content: JSON.stringify(signals),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Local alt-risk model returned HTTP ${response.status}.`);
  const payload = await response.json() as { message?: { content?: unknown } };
  if (typeof payload.message?.content !== "string") {
    throw new Error("Local alt-risk model response did not contain text.");
  }
  return parseAltAssessment(payload.message.content);
}
