//uploads/tmp     uploads/final   INITIATED      COMPLETED

import path from "path";
import env from "../../config/env.js";

export const UPLOAD_ROOT = path.resolve(env.UPLOAD_ROOT)
export const TEMP_DIR = path.join(UPLOAD_ROOT, "temp")
export const FINAL_DIR = path.join(UPLOAD_ROOT, "final")
export const UPLOAD_STATUS = {
    INITIATED: "INITIATED",
    UPLOADING: "UPLOADING",
    COMPLETING: "COMPLETING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
} as const

//input limits: schema layer validates them, service layer enforces them again (defense in depth)
export const MAX_FILE_SIZE_BYTES = 5n * 1024n * 1024n * 1024n //5 GiB
export const MAX_CHUNK_SIZE_BYTES = 16 * 1024 * 1024 //16 MiB, prevents a single chunk from flooding disk
export const MAX_TOTAL_CHUNKS = 10_000
export const MAX_FILE_NAME_LENGTH = 255
//no path separators, control chars or windows-reserved chars -> fileName can never escape its upload dir
export const SAFE_FILE_NAME_REGEX = /^[^\\/\u0000-\u001f\u007f<>:"|?*]+$/
