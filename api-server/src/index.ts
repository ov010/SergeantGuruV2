import app from "./app";
import { logger } from "./lib/logger";
import { setBotProcessStatus } from "./lib/bot-status";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const rawPort = process.env["PORT"]?.trim() || "3000";

const normalizedPort = rawPort;
const port = Number(normalizedPort);

if (
  !/^\d+$/.test(normalizedPort) ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65_535
) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  shutdown("SIGTERM", 1);
});

const botScriptPath = fileURLToPath(new URL("./bot.mjs", import.meta.url));
const botWorkingDirectory = fileURLToPath(new URL("../", import.meta.url));
const requiredBotSecrets = ["DISCORD_BOT_TOKEN", "ROBLOX_OPEN_CLOUD_API_KEY"] as const;
let botProcess: ChildProcess | undefined;
let restartTimer: NodeJS.Timeout | undefined;
let shuttingDown = false;
let restartScheduled = false;
let restartDelayMs = 5_000;

function scheduleBotRestart() {
  if (shuttingDown || restartScheduled) return;
  restartScheduled = true;
  setBotProcessStatus("restarting");
  const delay = restartDelayMs;
  restartDelayMs = Math.min(restartDelayMs * 2, 5 * 60_000);
  logger.warn({ delay }, "Discord bot stopped; scheduling a restart");
  restartTimer = setTimeout(() => {
    restartScheduled = false;
    startBot();
  }, delay);
  restartTimer.unref();
}

function startBot() {
  if (shuttingDown) return;
  const missingSecrets = requiredBotSecrets.filter((key) => !process.env[key]?.trim());
  if (missingSecrets.length > 0) {
    setBotProcessStatus("disabled");
    logger.error(
      { missingSecrets },
      "Discord badge bot is not starting because required environment variables are missing",
    );
    return;
  }

  logger.info("Starting the Discord badge bot");
  setBotProcessStatus("starting");
  const child = spawn(process.execPath, [botScriptPath], {
    cwd: botWorkingDirectory,
    env: process.env,
    stdio: "inherit",
  });
  botProcess = child;

  child.once("spawn", () => {
    if (botProcess === child) setBotProcessStatus("running");
  });

  child.once("error", (err) => {
    if (botProcess === child) botProcess = undefined;
    logger.error({ err }, "Failed to start the Discord badge bot process");
    scheduleBotRestart();
  });

  child.once("exit", (code, signal) => {
    if (botProcess === child) botProcess = undefined;
    if (shuttingDown) return;
    setBotProcessStatus("stopped");
    logger.error({ code, signal }, "Discord badge bot process exited");
    scheduleBotRestart();
  });
}

function shutdown(signal: NodeJS.Signals, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  setBotProcessStatus("stopping");

  const child = botProcess;
  const botStopped = new Promise<void>((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    child.once("close", () => resolve());
    if (!child.kill(signal)) {
      logger.warn({ signal }, "Could not signal the Discord bot process");
    }
  });
  const serverClosed = new Promise<void>((resolve) => {
    server.close((err) => {
      if (err) logger.error({ err }, "Error while closing the API server");
      resolve();
    });
  });

  const forceShutdownTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing remaining processes to exit");
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    server.closeAllConnections();
    process.exit(1);
  }, 10_000);

  Promise.all([botStopped, serverClosed]).then(() => {
    clearTimeout(forceShutdownTimer);
    setBotProcessStatus("stopped");
    logger.info("API server and Discord bot shut down");
    process.exitCode = exitCode;
  });
}

if (process.env["NODE_ENV"] !== "test") {
  startBot();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
