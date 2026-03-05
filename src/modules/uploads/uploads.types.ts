import type { Request } from "express";

export type StoreChunkParams  ={
    uploadId: string,
    chunkIndex: number,
    reqStream: Request
}


export type MergeChunkParams  = {
    uploadId: string    
}

export type UploadSessionMeta = {
    fileName: string,
    fileSize: number,
    totalChunks: number
}
