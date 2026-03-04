import uploadRoutes from "./modules/uploads/uploads.routes.js"
import express from "express";
const app = express();

app.use(express.json())
app.use("/uploads", uploadRoutes)
//todo: error middleware
export default app