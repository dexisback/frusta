import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError.js";



export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
) {
    if(err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            statusCode: err.statusCode,
            message: err.message
        })
    }
    console.error(err)

    return res.status(500).json({
        success: false,
        statusCode: 500,
        message: "internal server error"
    })
}
