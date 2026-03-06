import { errorHandler } from "./middleware/errorHandler.middleware.js";
import uploadRoutes from "./modules/uploads/uploads.routes.js"
import express from "express";
const app = express();

app.use(express.json())
app.use("/uploads", uploadRoutes)

app.use(errorHandler)


export default app