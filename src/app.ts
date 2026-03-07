import { errorHandler } from "./middleware/errorHandler.middleware.js";
import { notFound } from "./middleware/notFound.middleware.js";
import { requestLogger } from "./middleware/requestLogger.middleware.js";
import uploadRoutes from "./modules/uploads/uploads.routes.js"
import express from "express";
const app = express();

app.use(express.json())

app.use(requestLogger)
app.use("/uploads", uploadRoutes)
app.use(notFound)
app.use(errorHandler)


export default app