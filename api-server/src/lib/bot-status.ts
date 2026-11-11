export type BotProcessStatus =
  | "disabled"
  | "starting"
  | "running"
  | "restarting"
  | "stopping"
  | "stopped";

let botProcessStatus: BotProcessStatus = "disabled";

export function getBotProcessStatus(): BotProcessStatus {
  return botProcessStatus;
}

export function setBotProcessStatus(status: BotProcessStatus): void {
  botProcessStatus = status;
}
