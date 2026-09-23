export class ApiError extends Error {
    readonly statusCode: number;
    readonly success: boolean;
    readonly details?: Record<string, string[]> | undefined;

    constructor(statusCode: number, message: string, details?: Record<string, string[]>) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.success = false;
        this.details = details;

        Error.captureStackTrace?.(this, ApiError);
    }
}


