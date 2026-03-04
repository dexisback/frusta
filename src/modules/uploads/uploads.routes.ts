import { Router } from "express";
import { chunkController, initiateController, completedController } from "./uploads.controller.js";
const router = Router();


router.post("/initiate", initiateController)
router.post("/chunk", chunkController)
router.post("/complete", completedController)
