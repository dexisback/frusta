
import { prepareUploadDir,storeChunk, mergeChunks } from "./uploads.service.js";
import type { Request, Response } from "express";
import { chunkQuerySchema, completedSandeshaSchema, incomingSandeshaSchema } from "./uploads.schema.js";
import {prisma} from "../../db/prisma.js"
import { UPLOAD_STATUS } from "./uploads.constants.js";
export async function initiateController(req: Request, res: Response){
    const result= incomingSandeshaSchema.safeParse(req.body)
    if(!result.success){
        res.status(400).json({msg: "invalid incoming request"})
        return 
    }
    const data= result.data

    //when initiating upload, we create a new upload session, we store metadata about the file (fileName, fileSize, totalChunks)
    //db.push(data)    
    const push = await prisma.uploadSession.create({data: { fileName: data.fileName, fileSize: data.fileSize, totalChunks: data.totalChunks, status: UPLOAD_STATUS.INITIATED}})
    // console.log(push)
    const uploadId = push.id
    
    //make the temp dir 
    await prepareUploadDir(uploadId) 
    //return
    return res.status(201).json({uploadId})

    
}


export async function chunkController(req: Request, res: Response){
    //todo:
    //whent the first chunk arrives, the status changes from init to uploading
    //record each chunk in db
    //chunks might NOT be in order, so currnt logic would return wrong process
    const result = chunkQuerySchema.safeParse(req.query)
    if(!result.success){return res.status(400).json({msg: "invalid chunk query"})}
    // const data = result.data    NOT needed 
    const {uploadId, chunkIndex} = result.data    
    
    //first check if uploadSession exists , as in id = uploadId should exist in db
    const weFind = await  prisma.uploadSession.findUnique({where: { id: uploadId}})
    if(!weFind){return res.status(404).json("did not find the uploadId in db")}
    const totalChunksCode= Number(weFind.totalChunks)
    if(chunkIndex>=totalChunksCode){ return res.status(400).json({msg: "the current chunk index exceeds total chunks set initially"})} 
     //else: verified that uploadId exists in db, and current chunk index does not exceed
    
    //if the incoming req is the first req, then initiate state
    if(weFind.status === UPLOAD_STATUS.INITIATED){
        await prisma.uploadSession.update({where: {id: uploadId}, data: { status: UPLOAD_STATUS.UPLOADING}})
    }

    

     await storeChunk({uploadId, chunkIndex, reqStream: req})      //reqStream still missing 

     //record chunk metadata in db:
     await prisma.uploadChunk.create({data: {uploadSessionId: uploadId, chunkIndex, size: Number(req.headers["content-length"]?? 0)}}).catch(()=>{})

     const uploadedChunks = await prisma.uploadChunk.count({where: {uploadSessionId: uploadId}})
    return res.status(200).json({uploadedChunks: uploadedChunks, totalChunks: totalChunksCode})
    
}

export async function completedController(req: Request, res: Response){
    //verify if session exists through uploadId
    //check if all chunks are uploaded
    // transition state -> uploading to completed
    //call mergeChunks
    //update Db to completed
    //return succes
    const result = completedSandeshaSchema.safeParse(req.body)
    if(!result.success){
        return res.status(400).json({message: "invalid query"})
    }
    const {uploadId}  = result.data
    //check if upload session w the given uploadId exists:
    const check = await  prisma.uploadSession.findUnique({where: {id: uploadId}})
    if(!check){return res.status(400).json({msg: "invalid upload id"})}
    if(check.status === UPLOAD_STATUS.COMPLETED){return res.status(200).json({msg: "upload already completed "})}   //this is not 4xx because this is not really an error, but rather an idempotent success
    
    //before merge , system should verify if all chunks have been uploaded count(uploadChunks) === totalChunks   (since they aint in order)
    const uploadedChunks = await prisma.uploadChunk.count({where: {uploadSessionId: uploadId}})
    if(uploadedChunks !== Number(check.totalChunks)){return res.status(400).json({msg: "some chunks are still left "})}

    //transition update:
      await prisma.uploadSession.update({
    where: { id: uploadId },
    data: {
      status: UPLOAD_STATUS.COMPLETING,
      mergeStartedAt: new Date()
    }
  })


    await mergeChunks({uploadId})
     await prisma.uploadSession.update({
    where: { id: uploadId },
    data: {
      status: UPLOAD_STATUS.COMPLETED,
      mergeCompletedAt: new Date()
    }
  })
    return res.status(200).json({msg: "successs, upload complete"})
    

}
