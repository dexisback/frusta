//uploads/tmp     uploads/final   INITIATED      COMPLETED


import path from "path";


export const UPLOAD_ROOT = path.resolve("uploads")
export const TEMP_DIR = path.join(UPLOAD_ROOT, "temp")
export const FINAL_DIR = path.join(UPLOAD_ROOT, "final")
export const UPLOAD_STATUS = {
    INITIATED: "INITIATED",
    UPLOADING: "UPLOADING",
    COMPLETING: "COMPLETING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
} as const 
