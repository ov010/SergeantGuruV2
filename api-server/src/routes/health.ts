import { Router, type IRouter } from "express";
import { getBotProcessStatus } from "../lib/bot-status";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", bot: { status: getBotProcessStatus() } });
});

export default router;
