import { z } from "zod"
import { ApiError } from "./apiError.js"

//turns a ZodError into a 400 ApiError that carries per-field error details,
//so clients see exactly which input was rejected and why
export function invalidRequest(error: z.ZodError): ApiError {
    return new ApiError(400, "Validation failed", z.flattenError(error).fieldErrors)
}
