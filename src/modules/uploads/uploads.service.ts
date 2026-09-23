//preps storage, manage each chunk , merge chunks, renaming, cleanup
import { TEMP_DIR, FINAL_DIR, UPLOAD_ROOT, MAX_CHUNK_SIZE_BYTES, SAFE_FILE_NAME_REGEX } from "./uploads.constants.js"
import type { StoreChunkParams,MergeChunkParams } from "./uploads.types.js"
import fs from "fs"
import path from "path"
import { Transform } from "stream"
import {pipeline} from "stream/promises"
import {prisma} from "../../db/prisma.js"
import { ApiError } from "../../utils/apiError.js"
import { validateFinalFile } from "./fileValidator.service.js"
// prepareUploadDir, storeChunk, mergeChunks, 

//TEMP_DIR, and FINAL_DIR

//we were not renaming the temp to the final, we were renaming the "tempFile" named file INSIDE the final/ folder when we are done moving
//ensure base dirs exist:
async function existEnsurer(){
    if(!fs.existsSync(UPLOAD_ROOT)){
        fs.mkdirSync(UPLOAD_ROOT)
    }
    if(!fs.existsSync(TEMP_DIR)){
        fs.mkdirSync(TEMP_DIR)
    }
    if(!fs.existsSync(FINAL_DIR)){
        fs.mkdirSync(FINAL_DIR)
    }
}
existEnsurer()


export async function prepareUploadDir(uploadId: string){
    const uploadPath = path.join(TEMP_DIR, uploadId)
    
    if(!fs.existsSync(uploadPath)){
        await fs.promises.mkdir(uploadPath, {recursive: true})
    }
}


//counts the bytes flowing through and aborts the stream the moment they exceed maxBytes,
//so a client that lies about content-length cannot keep writing to disk forever
function byteLimiter(maxBytes: number){
    let received = 0
    return new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length
            if(received > maxBytes){
                callback(new ApiError(413, `chunk size exceeds the ${maxBytes} byte limit`))
                return
            }
            callback(null, chunk)
        },
    })
}


export async function storeChunk({uploadId, chunkIndex, reqStream}: StoreChunkParams){
    const chunkPath = path.join(TEMP_DIR, uploadId, `chunk${chunkIndex}`)
    const tempChunkPath = `${chunkPath}.part`

    if(fs.existsSync(chunkPath)){return false} //if chunk alr exist, dont do
    
    const writeStream = fs.createWriteStream(tempChunkPath)

    try {
        await pipeline(reqStream, byteLimiter(MAX_CHUNK_SIZE_BYTES), writeStream)
        await fs.promises.rename(tempChunkPath, chunkPath)
        return true
    } catch (error) {
        await fs.promises.rm(tempChunkPath, { force: true })
        throw error
    }
}

export async function deleteChunk({uploadId, chunkIndex}: Pick<StoreChunkParams, "uploadId" | "chunkIndex">){
    const chunkPath = path.join(TEMP_DIR, uploadId, `chunk${chunkIndex}`)
    await fs.promises.rm(chunkPath, { force: true })
    await fs.promises.rm(`${chunkPath}.part`, { force: true })
}



export async function mergeChunks({uploadId, expectedChecksum}: MergeChunkParams){
    const session = await prisma.uploadSession.findUnique({
        where: { id: uploadId }
    })
    if(!session){
        throw new Error("upload session not found")
    }

    //defense in depth: fileName was validated at initiate, re-check before it touches the filesystem
    if(!SAFE_FILE_NAME_REGEX.test(session.fileName)){
        throw new ApiError(400, "stored fileName contains illegal path characters")
    }

    const chunkDir = path.join(TEMP_DIR, uploadId)
    const finalTempPath =path.join(FINAL_DIR, `${uploadId}-${session.fileName}.part`)  //finaldir/uploadid/filename
    const finalPath = path.join(FINAL_DIR, `${uploadId}-${session.fileName}`)
    const writeStream = fs.createWriteStream(finalTempPath)

    for(let i=0; i<session.totalChunks; i++){
        const chunkPath = path.join(chunkDir, `chunk${i}`)
        if(!fs.existsSync(chunkPath)){
            throw new Error("no chunk path found!")
        }
        
        const readStream = fs.createReadStream(chunkPath)
        await pipeline(readStream, writeStream, {end: false})
    }
    writeStream.end()



    await new Promise((resolve, reject)=>{
        writeStream.on("finish", resolve)
        writeStream.on("error", reject)
    })


    await fs.promises.rename(finalTempPath, finalPath)  //atomic rename 

    //content-level verification of the actual merged bytes; any failure deletes the
    //final file so disallowed content never stays on disk
    try {
        //integrity: merged size must be exactly the size declared at initiate
        const mergedStat = await fs.promises.stat(finalPath)
        if(BigInt(mergedStat.size) !== session.fileSize){
            throw new ApiError(400, "merged file size does not match the declared file size")
        }

        //integrity: magic numbers must be an allowed video type, and when a checksum
        //was declared the bytes must hash to it
        await validateFinalFile({ filePath: finalPath, expectedChecksum })
    } catch (error) {
        await fs.promises.rm(finalPath, { force: true })
        throw error
    }

    await fs.promises.rm(chunkDir, { recursive: true, force: true }) //cleanup chunk dir
}
