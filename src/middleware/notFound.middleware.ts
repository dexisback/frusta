import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";
export function notFound(
    req:Request,res: Response, next:NextFunction
) {
    next(new ApiError(404, "Route not found"))
}

//when someone calls <random-url>
