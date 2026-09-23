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
        return res.status(err.statusCode).json(new ApiResponse(err.statusCode, err.message, err.details))
    }

    //body-parser failures: malformed json and oversized bodies should be client errors, not 500s
    const type = (err as { type?: string } | null)?.type
    if(type === "entity.parse.failed"){
        return res.status(400).json(new ApiResponse(400, "malformed request body"))
    }
    if(type === "entity.too.large"){
        return res.status(413).json(new ApiResponse(413, "request body too large"))
    }

    console.error(err)

    return res.status(500).json(new ApiResponse(500, "internal server error"))
}
