//content-level validation: what the bytes actually are beats what the name claims.
//a renamed virus.exe passes the extension allowlist but cannot fake these checks
import fs from "fs"
import crypto from "crypto"
import { fileTypeFromFile } from "file-type"
import { ALLOWED_MIME_TYPES } from "./uploads.constants.js"
import { ApiError } from "../../utils/apiError.js"

//magic numbers: reads the raw header bytes of the final file and only accepts
//detected video containers. an attacker renaming virus.exe to video.mp4 gets
//rejected here because application/x-msdownload is not an allowed mime
export async function assertIsAllowedVideoType(filePath: string) {
    const detected = await fileTypeFromFile(filePath)
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        throw new ApiError(400, "file content does not match an allowed video format")
    }
    return detected
}

//hashes the file streaming chunk by chunk, so even a 5 GiB merge never enters memory
function sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256")
        const readStream = fs.createReadStream(filePath)
        readStream.on("data", (chunk) => hash.update(chunk))
        readStream.on("end", () => resolve(hash.digest("hex")))
        readStream.on("error", reject)
    })
}

//runs every content-level check on the merged file:
//1. magic numbers must resolve to an allowed video mime
//2. when a checksum was declared, the actual bytes must hash to it
export async function validateFinalFile({ filePath, expectedChecksum }: { filePath: string; expectedChecksum?: string | null | undefined }) {
    await assertIsAllowedVideoType(filePath)

    if (expectedChecksum) {
        const actualChecksum = await sha256File(filePath)
        if (actualChecksum !== expectedChecksum.toLowerCase()) {
            throw new ApiError(400, "file content does not match the declared checksum")
        }
    }
}
