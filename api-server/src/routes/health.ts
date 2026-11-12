import { Router, type IRouter } from "express";
import { getBotProcessStatus } from "../lib/bot-status";
import packageJson from "../../package.json";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", version: packageJson.version, bot: { status: getBotProcessStatus() } });
});

export default router;
