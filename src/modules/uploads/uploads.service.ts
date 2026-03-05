//preps storage, manage each chunk , merge chunks, renaming, cleanup
import { TEMP_DIR, FINAL_DIR } from "./uploads.constants.js"
import type { StoreChunkParams,MergeChunkParams, UploadSessionMeta } from "./uploads.types.js"
import { UPLOAD_STATUS } from "./uploads.constants.js"
import fs from "fs"
import path from "path"
import {pipeline} from "stream/promises"
import {prisma} from "../../db/prisma.js"
// prepareUploadDir, storeChunk, mergeChunks, 

const UPLOAD_ROOT = path.resolve("uploads")
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


export async function storeChunk({uploadId, chunkIndex, reqStream}: StoreChunkParams){
    const chunkPath = path.join(TEMP_DIR, uploadId, `chunk${chunkIndex}`)

    if(fs.existsSync(chunkPath)){return} //if chunk alr exist, dont do
    
    const writeStream = fs.createWriteStream(chunkPath)   //creating a stream to the path 

    await pipeline(reqStream, writeStream)
}



export async function mergeChunks({uploadId}: MergeChunkParams){
    const session = await prisma.uploadSession.findUnique({
        where: { id: uploadId }
    })
    if(!session){
        throw new Error("upload session not found")
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
    await fs.promises.rm(chunkDir, { recursive: true, force: true }) //cleanup chunk dir
}
