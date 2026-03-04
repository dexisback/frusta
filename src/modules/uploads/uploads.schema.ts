
//"sandesh of incoming" ->"chunks" (inclusive of failover and shii)-> "sandesh of completed "
//uploads initiate, completeupload, chunkQuery
//initially the upload which comes contains fileName, fileSize, totalChunks
//a singular chunkQuery contains the chunk uploadId, chunkIndex

import z from "zod"
export const chunkQuerySchema = z.object({
    uploadId: z.string().uuid(),
    chunkIndex : z.coerce.number().int().nonnegative()
})


export const completedSandeshaSchema = z.object({
    uploadId : z.string().uuid()
})


export const incomingSandeshaSchema = z.object({
    fileName : z.string().min(1).max(200),
    fileSize: z.coerce.bigint().gt(0n, {message: "file size should be greater than 0"}), //til that big int are written w a 'n' after their digits lol :/
    totalChunks : z.coerce.number().int().gt(0)
})



//types:
export type incomingSandeshaSchemaType = z.infer<typeof incomingSandeshaSchema>
export type completedSandeshaSchemaType= z.infer<typeof completedSandeshaSchema>
export type chunkQuerySchemaType = z.infer<typeof chunkQuerySchema>
