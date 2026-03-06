export class ApiError extends Error {
    readonly statusCode: number;
    readonly success: boolean;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.success = false;

        Error.captureStackTrace?.(this, ApiError);
    }
}


