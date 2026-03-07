import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";



export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
) {
    if(err instanceof ApiError) {
        return res.status(err.statusCode).json(new ApiResponse(err.statusCode, err.message))
    }
    console.error(err)

    return res.status(500).json(new ApiResponse(500, "internal server error"))
}
