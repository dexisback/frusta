import type { Request } from "express";

export type StoreChunkParams  ={
    uploadId: string,
    chunkIndex: number,
    reqStream: Request
}


export type MergeChunkParams  = {
    uploadId: string,
    expectedChecksum?: string | null
}

export type UploadSessionMeta = {
    fileName: string,
    fileSize: number
}