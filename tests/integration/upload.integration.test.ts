process.env.UPLOAD_ROOT = "test-uploads";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";

import app from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { TEMP_DIR, FINAL_DIR } from "../../src/modules/uploads/uploads.constants";



async function resetState() {
  await prisma.uploadChunk.deleteMany();
  await prisma.uploadSession.deleteMany();
  await fs.promises.rm(process.env.UPLOAD_ROOT!, { recursive: true, force: true });
  await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  await fs.promises.mkdir(FINAL_DIR, { recursive: true });
}

async function createUploadSession(totalChunks = 3, fileName = "test.txt", fileSize = 12) {
  const res = await request(app).post("/uploads/initiate").send({
    fileName,
    fileSize,
    totalChunks,
  });

  expect(res.status).toBe(201);
  expect(res.body.success).toBe(true);
  expect(res.body.data?.uploadId).toBeDefined();

  return res.body.data.uploadId as string;
}

async function uploadChunk(uploadId: string, chunkIndex: number, body: Buffer | string) {
  return request(app)
    .post("/uploads/chunk")
    .query({ uploadId, chunkIndex })
    .set("Content-Type", "application/octet-stream")
    .send(body);
}




describe("Upload Engine", () => {
  
beforeEach(async () => {await resetState()});
afterAll(async () => {await resetState();await prisma.$disconnect();});


    
  it("t1: upload session initialisation", async () => {
    const uploadId = await createUploadSession(3, "init.txt", 20);

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session).not.toBeNull();
    expect(session?.fileName).toBe("init.txt");
    expect(Number(session?.totalChunks)).toBe(3);
    expect(session?.status).toBe("INITIATED");

    const uploadTempDir = path.join(TEMP_DIR, uploadId);
    expect(fs.existsSync(uploadTempDir)).toBe(true);
  });


  it("t2: chunk upload test", async () => {
    const uploadId = await createUploadSession(3, "chunk.txt", 9);

    const res = await uploadChunk(uploadId, 0, Buffer.from("abc"));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const chunkPath = path.join(TEMP_DIR, uploadId, "chunk0");
    expect(fs.existsSync(chunkPath)).toBe(true);

    const chunkRow = await prisma.uploadChunk.findFirst({
      where: { uploadSessionId: uploadId, chunkIndex: 0 },
    });
    expect(chunkRow).not.toBeNull();

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("UPLOADING");
  });

  it("t3:unordered chunk upload", async () => {
    const uploadId = await createUploadSession(3, "ooo.txt", 9);

    const r1 = await uploadChunk(uploadId, 2, "CCC");
    const r2 = await uploadChunk(uploadId, 0, "AAA");
    const r3 = await uploadChunk(uploadId, 1, "BBB");

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);

    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk1"))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk2"))).toBe(true);

    const count = await prisma.uploadChunk.count({ where: { uploadSessionId: uploadId } });
    expect(count).toBe(3);
  });

  it("t4: complete and merge", async () => {
    const uploadId = await createUploadSession(3, "merge.txt", 9);

    await uploadChunk(uploadId, 1, "BBB");
    await uploadChunk(uploadId, 0, "AAA");
    await uploadChunk(uploadId, 2, "CCC");

    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk1"))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk2"))).toBe(true);

    const completeRes = await request(app).post("/uploads/complete").send({ uploadId });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);

    const finalFile = path.join(FINAL_DIR, `${uploadId}-merge.txt`);
    expect(fs.existsSync(finalFile)).toBe(true);

    const mergedContent = await fs.promises.readFile(finalFile, "utf8");
    expect(mergedContent).toBe("AAABBBCCC");

    expect(fs.existsSync(path.join(TEMP_DIR, uploadId))).toBe(false);

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("COMPLETED");
  });

  it("t5: invalid chunk index rejection", async () => {
    const uploadId = await createUploadSession(3, "invalid.txt", 9);

    const res = await uploadChunk(uploadId, 3, "XXX");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    const invalidChunkPath = path.join(TEMP_DIR, uploadId, "chunk3");
    expect(fs.existsSync(invalidChunkPath)).toBe(false);

    const chunkCount = await prisma.uploadChunk.count({ where: { uploadSessionId: uploadId } });
    expect(chunkCount).toBe(0);

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("INITIATED");
  });
});
