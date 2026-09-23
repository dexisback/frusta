process.env.UPLOAD_ROOT = "test-uploads";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import http from "http";
import path from "path";

import app from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { TEMP_DIR, FINAL_DIR, MAX_CHUNK_SIZE_BYTES } from "../../src/modules/uploads/uploads.constants";

const SLOW_TEST_TIMEOUT_MS = 15_000;


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
  }, SLOW_TEST_TIMEOUT_MS);

  it("t3.1: status endpoint returns uploaded chunks", async () => {
    const uploadId = await createUploadSession(6, "status.txt", 18);

    await uploadChunk(uploadId, 4, "EEE");
    await uploadChunk(uploadId, 1, "BBB");
    await uploadChunk(uploadId, 0, "AAA");
    await uploadChunk(uploadId, 3, "DDD");

    const statusRes = await request(app).get(`/uploads/${uploadId}/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.success).toBe(true);
    expect(statusRes.body.data).toEqual({
      uploadId,
      status: "UPLOADING",
      uploadedChunks: [0, 1, 3, 4],
      totalChunks: 6,
    });
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
  }, SLOW_TEST_TIMEOUT_MS);

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

  it("t6: path traversal fileName is rejected with field details", async () => {
    const res = await request(app).post("/uploads/initiate").send({
      fileName: "../../etc/cron.d/pwned",
      fileSize: 9,
      totalChunks: 3,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data?.fileName?.[0]).toContain("illegal path characters");
    expect(res.body.data?.uploadId).toBeUndefined();
  });

  it("t7: chunk without a content-length header is rejected", async () => {
    const uploadId = await createUploadSession(3, "nolength.txt", 9);

    //chunked transfer-encoding = the one real-world case with no content-length header
    //(supertest and node's http client always send content-length)
    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port,
            path: `/uploads/chunk?uploadId=${uploadId}&chunkIndex=0`,
            method: "POST",
            headers: { "Content-Type": "application/octet-stream", "Transfer-Encoding": "chunked" },
          },
          (res) => {
            res.resume();
            res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
          },
        );
        req.on("error", reject);
        req.write("3\r\nAAA\r\n");
        req.end("0\r\n\r\n");
      });

      expect(res.status).toBe(411);
    } finally {
      server.close();
    }

    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(false);
  });

  it("t7.1: zero-length chunk is rejected", async () => {
    const uploadId = await createUploadSession(3, "empty.txt", 9);

    const res = await request(app)
      .post("/uploads/chunk")
      .query({ uploadId, chunkIndex: 0 })
      .set("Content-Type", "application/octet-stream")
      .set("Content-Length", "0");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(false);
  });

  it("t8: chunk exceeding the size limit is rejected", async () => {
    const uploadId = await createUploadSession(10_000, "big.bin", MAX_CHUNK_SIZE_BYTES + 1);

    const res = await uploadChunk(uploadId, 0, Buffer.alloc(MAX_CHUNK_SIZE_BYTES + 1));
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(false);
  }, SLOW_TEST_TIMEOUT_MS);

  it("t9: chunks are rejected once the session is completed", async () => {
    const uploadId = await createUploadSession(1, "done.txt", 3);
    await uploadChunk(uploadId, 0, "AAA");
    await request(app).post("/uploads/complete").send({ uploadId });

    const res = await uploadChunk(uploadId, 0, "BBB");
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});
