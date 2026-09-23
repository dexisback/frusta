
//"sandesh of incoming" ->"chunks" (inclusive of failover and shii)-> "sandesh of completed "
//uploads initiate, completeupload, chunkQuery
//initially the upload which comes contains fileName, fileSize, totalChunks
//a singular chunkQuery contains the chunk uploadId, chunkIndex

import z from "zod"
import path from "path"
import {
    ALLOWED_FILE_EXTENSIONS,
    MAX_CHUNK_SIZE_BYTES,
    MAX_FILE_NAME_LENGTH,
    MAX_FILE_SIZE_BYTES,
    MAX_TOTAL_CHUNKS,
    SAFE_FILE_NAME_REGEX,
} from "./uploads.constants.js"

//fileName lands inside path.join(FINAL_DIR, `${uploadId}-${fileName}`),
//so it must never carry path separators or control characters (path traversal),
//and only video extensions may be declared
const fileNameSchema = z
    .string()
    .trim()
    .min(1, "fileName is required")
    .max(MAX_FILE_NAME_LENGTH, `fileName must be at most ${MAX_FILE_NAME_LENGTH} characters`)
    .regex(SAFE_FILE_NAME_REGEX, "fileName contains illegal path characters")
    .refine(
        (name) => ALLOWED_FILE_EXTENSIONS.has(path.extname(name).toLowerCase()),
        { message: `fileName must have an allowed video extension (${[...ALLOWED_FILE_EXTENSIONS].join(", ")})` },
    )

export const chunkQuerySchema = z.object({
    uploadId: z.string().uuid(),
    chunkIndex: z.coerce
        .number()
        .int()
        .nonnegative()
        .max(MAX_TOTAL_CHUNKS, `chunkIndex exceeds the ${MAX_TOTAL_CHUNKS} chunk limit`),
})


export const completedSandeshaSchema = z.object({
    uploadId: z.string().uuid(),
    //optional integrity proof: sha256 of the merged bytes, declared by the uploader.
    //when present, the service hashes the merged file and rejects any mismatch
    checksum: z
        .string()
        .regex(/^[a-f0-9]{64}$/i, "checksum must be a 64 character sha256 hex digest")
        .optional(),
})

export const statusParamsSchema = z.object({
    uploadId: z.string().uuid()
})


export const incomingSandeshaSchema = z
    .object({
        fileName: fileNameSchema,
        fileSize: z.coerce
            .bigint()
            .gt(0n, { message: "file size should be greater than 0" }) //til that big int are written w a 'n' after their digits lol :/
            .lte(MAX_FILE_SIZE_BYTES, { message: `file size exceeds the ${MAX_FILE_SIZE_BYTES} byte limit` }),
        totalChunks: z.coerce
            .number()
            .int()
            .gt(0)
            .max(MAX_TOTAL_CHUNKS, { message: `totalChunks exceeds the ${MAX_TOTAL_CHUNKS} chunk limit` }),
    })
    //every chunk holds at least 1 byte, so declared size must cover all chunks
    .refine((data) => data.fileSize >= BigInt(data.totalChunks), {
        message: "fileSize is smaller than totalChunks (each chunk needs at least 1 byte)",
        path: ["fileSize"],
    })
    //a single chunk can never exceed MAX_CHUNK_SIZE_BYTES, so fileSize must fit within totalChunks * chunk limit
    .refine((data) => data.fileSize <= BigInt(data.totalChunks) * BigInt(MAX_CHUNK_SIZE_BYTES), {
        message: `fileSize is too large for ${MAX_TOTAL_CHUNKS} chunks or fewer (a chunk cannot exceed ${MAX_CHUNK_SIZE_BYTES} bytes)`,
        path: ["fileSize"],
    })



//types:
export type incomingSandeshaSchemaType = z.infer<typeof incomingSandeshaSchema>
export type completedSandeshaSchemaType= z.infer<typeof completedSandeshaSchema>
export type chunkQuerySchemaType = z.infer<typeof chunkQuerySchema>
export type statusParamsSchemaType = z.infer<typeof statusParamsSchema>