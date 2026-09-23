import { errorHandler } from "./middleware/errorHandler.middleware.js";
import { notFound } from "./middleware/notFound.middleware.js";
import { requestLogger } from "./middleware/requestLogger.middleware.js";
import uploadRoutes from "./modules/uploads/uploads.routes.js"
import express from "express";
const app = express();

//json bodies are tiny metadata payloads only; the big data flows through /uploads/chunk as a raw stream
app.use(express.json({ limit: "16kb" }))

app.use(requestLogger)
app.use("/uploads", uploadRoutes)
app.use(notFound)
app.use(errorHandler)


export default app