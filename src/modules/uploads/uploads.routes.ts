import { Router } from "express";
import { chunkController, initiateController, completedController, statusController } from "./uploads.controller.js";
const router = Router();


router.post("/initiate", initiateController)
router.post("/chunk", chunkController)
router.post("/complete", completedController)
router.get("/:uploadId/status", statusController)


export default router
