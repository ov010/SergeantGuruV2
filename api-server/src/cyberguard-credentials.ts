import type { Client } from "discord.js";

export interface CredentialDelivery {
  id: number;
  username: string;
  discordId: string;
  password: string;
}

export interface CredentialDeliveryResult {
  id: number;
  ok: boolean;
  error?: string;
}

const DISCORD_ID = /^\d{15,22}$/;
const DEFAULT_PASSWORD = /^[A-Za-z0-9-]{8,40}$/;
const MAX_PER_POLL = 10;
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_INTERVAL_MS = 15_000;

/**
 * CyberGuard Helper queues a member's default password; only well-formed
 * entries are accepted so a broken payload can never send garbage to a user.
 */
export function parseCredentialDeliveries(payload: unknown): CredentialDelivery[] {
  const list = (payload as { deliveries?: unknown } | null)?.deliveries;
  if (!Array.isArray(list)) return [];
  const deliveries: CredentialDelivery[] = [];
  for (const entry of list) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const id = Number(record.id);
    const username = typeof record.username === "string" ? record.username.trim().slice(0, 20) : "";
    const discordId = typeof record.discordId === "string" ? record.discordId.trim() : "";
    const password = typeof record.password === "string" ? record.password.trim() : "";
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!username || !DISCORD_ID.test(discordId) || !DEFAULT_PASSWORD.test(password)) continue;
    deliveries.push({ id, username, discordId, password });
    if (deliveries.length >= MAX_PER_POLL) break;
  }
  return deliveries;
}

/** The DM a member receives with their CyberGuard Helper default password. */
export function credentialDmText(delivery: CredentialDelivery, siteUrl = ""): string {
  const lines = [
    "**CyberGuard Helper password**",
    "",
    `Roblox username: \`${delivery.username}\``,
    `Default password: \`${delivery.password}\``,
    "",
    siteUrl
      ? `Sign in at <${siteUrl}>, then change the password under **Create a password**.`
      : "Sign in, then change the password under **Create a password**.",
    "",
    "If you did not ask for this, tell Guru_Guru1X.",
  ];
  return lines.join("\n");
}

/**
 * Polls CyberGuard Helper for queued default passwords and DMs each member.
 * Delivery is best-effort: one failed DM is reported back so it is not retried
 * forever, and a polling error never affects the rest of the bot.
 */
export function startCredentialDelivery(
  client: Client,
  {
    baseUrl,
    token,
    intervalMs = DEFAULT_INTERVAL_MS,
    log,
  }: {
    baseUrl: string;
    token: string;
    intervalMs?: number;
    log?: (message: string, error?: unknown) => void;
  },
): () => void {
  const report = log ?? (() => undefined);
  const origin = baseUrl.replace(/\/+$/, "");
  let endpoint: string;
  let siteOrigin: string;
  try {
    const parsed = new URL(`${origin}/api/integration/password-deliveries`);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
      report(`CYBERGUARD_BASE_URL must use https: ${baseUrl}`);
      return () => undefined;
    }
    endpoint = parsed.toString();
    siteOrigin = parsed.origin;
  } catch {
    report(`CYBERGUARD_BASE_URL is not a valid URL: ${baseUrl}`);
    return () => undefined;
  }

  let stopped = false;
  let busy = false;

  async function poll(): Promise<void> {
    if (busy || stopped || !client.isReady()) return;
    busy = true;
    try {
      const response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        if (response.status !== 404) {
          report(`CyberGuard Helper returned HTTP ${response.status} for password deliveries`);
        }
        return;
      }
      const deliveries = parseCredentialDeliveries(await response.json());
      if (!deliveries.length || stopped) return;

      const results: CredentialDeliveryResult[] = [];
      for (const delivery of deliveries) {
        try {
          const user = await client.users.fetch(delivery.discordId);
          await user.send({
            content: credentialDmText(delivery, siteOrigin),
            allowedMentions: { parse: [] },
          });
          results.push({ id: delivery.id, ok: true });
          report(`Sent the CyberGuard Helper password to ${delivery.username}`);
        } catch (error) {
          // Members can close their DMs; record that so the queue does not grow.
          const message = (error instanceof Error ? error.message : "Discord refused the DM").slice(0, 200);
          results.push({ id: delivery.id, ok: false, error: message });
          report(`Could not DM the CyberGuard Helper password for ${delivery.username}`, error);
        }
      }

      await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ results }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      report("CyberGuard Helper password delivery check failed", error);
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(() => void poll(), intervalMs);
  timer.unref();
  void poll();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
