process.env.UPLOAD_ROOT = "test-uploads";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import path from "path";

import app from "../../src/app";
import { prisma } from "../../src/db/prisma";
import { TEMP_DIR, FINAL_DIR, MAX_CHUNK_SIZE_BYTES } from "../../src/modules/uploads/uploads.constants";

const SLOW_TEST_TIMEOUT_MS = 15_000;

//24-byte minimal ftyp box that file-type detects as video/mp4
const MP4_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypisom"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("isommp42"),
]);

async function resetState() {
  await prisma.uploadChunk.deleteMany();
  await prisma.uploadSession.deleteMany();
  await fs.promises.rm(process.env.UPLOAD_ROOT!, { recursive: true, force: true });
  await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  await fs.promises.mkdir(FINAL_DIR, { recursive: true });
}

//default file: the mp4 header padded so it splits into totalChunks equal 8-byte chunks
async function createUploadSession(totalChunks = 3, fileName = "test.mp4", fileSize = MP4_HEADER.length + totalChunks * 8) {
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

//splits a declared file content into exactly totalChunks parts, quota-compatible
function chunkify(content: Buffer, totalChunks: number): Buffer[] {
  const chunkSize = Math.ceil(content.length / totalChunks);
  const chunks: Buffer[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.subarray(i, i + chunkSize));
  }
  if (chunks.length > totalChunks) {
    throw new Error("content does not fit into the requested chunk count");
  }
  while (chunks.length < totalChunks) {
    chunks.push(Buffer.from("x")); //pad chunks hold 1 byte each
  }
  return chunks;
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
    const uploadId = await createUploadSession(3, "init.mp4", 20);

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session).not.toBeNull();
    expect(session?.fileName).toBe("init.mp4");
    expect(Number(session?.totalChunks)).toBe(3);
    expect(session?.status).toBe("INITIATED");

    const uploadTempDir = path.join(TEMP_DIR, uploadId);
    expect(fs.existsSync(uploadTempDir)).toBe(true);
  });


  it("t2: chunk upload test", async () => {
    const uploadId = await createUploadSession(3, "chunk.mp4", 9);

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
    const uploadId = await createUploadSession(3, "ooo.mp4", 9);

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
    const uploadId = await createUploadSession(6, "status.mp4", 18);

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
    const uploadId = await createUploadSession(3, "merge.mp4", MP4_HEADER.length);
    const [part0, part1, part2] = [MP4_HEADER.subarray(0, 8), MP4_HEADER.subarray(8, 16), MP4_HEADER.subarray(16, 24)];

    await uploadChunk(uploadId, 1, part1);
    await uploadChunk(uploadId, 0, part0);
    await uploadChunk(uploadId, 2, part2);

    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk1"))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk2"))).toBe(true);

    const completeRes = await request(app).post("/uploads/complete").send({ uploadId });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);

    const finalFile = path.join(FINAL_DIR, `${uploadId}-merge.mp4`);
    expect(fs.existsSync(finalFile)).toBe(true);

    const mergedContent = await fs.promises.readFile(finalFile);
    expect(mergedContent.equals(MP4_HEADER)).toBe(true);

    expect(fs.existsSync(path.join(TEMP_DIR, uploadId))).toBe(false);

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("COMPLETED");
  }, SLOW_TEST_TIMEOUT_MS);

  it("t5: invalid chunk index rejection", async () => {
    const uploadId = await createUploadSession(3, "invalid.mp4", 9);

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

  it("t6.1: disallowed file extension is rejected with field details", async () => {
    for (const fileName of ["payload.exe", "notes.txt", "movie.mp4.exe"]) {
      const res = await request(app).post("/uploads/initiate").send({
        fileName,
        fileSize: 9,
        totalChunks: 3,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.data?.fileName?.[0]).toContain("allowed video extension");
      expect(res.body.data?.uploadId).toBeUndefined();
    }
  });

  it("t7: chunk without a content-length header is rejected", async () => {
    const uploadId = await createUploadSession(3, "nolength.mp4", 9);

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
    const uploadId = await createUploadSession(3, "empty.mp4", 9);

    const res = await request(app)
      .post("/uploads/chunk")
      .query({ uploadId, chunkIndex: 0 })
      .set("Content-Type", "application/octet-stream")
      .set("Content-Length", "0");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(false);
  });

  it("t7.2: chunk with a parsed content-type is rejected", async () => {
    const uploadId = await createUploadSession(3, "wrongtype.mp4", 9);

    //a json body would be consumed by the body parser before the stream writer sees it
    const res = await request(app)
      .post("/uploads/chunk")
      .query({ uploadId, chunkIndex: 0 })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(false);
  });

  it("t8: chunk exceeding the size limit is rejected", async () => {
    const uploadId = await createUploadSession(10_000, "big.mp4", MAX_CHUNK_SIZE_BYTES + 1);

    const res = await uploadChunk(uploadId, 0, Buffer.alloc(MAX_CHUNK_SIZE_BYTES + 1));
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk0"))).toBe(false);
  }, SLOW_TEST_TIMEOUT_MS);

  it("t8.1: chunk exceeding the declared fileSize quota is rejected", async () => {
    const uploadId = await createUploadSession(3, "quota.mp4", 30);

    const content = Buffer.concat([MP4_HEADER, Buffer.alloc(6)]);
    const first = await uploadChunk(uploadId, 0, content.subarray(0, 20)); //20 of 30 bytes
    expect(first.status).toBe(200);

    const res = await uploadChunk(uploadId, 1, content.subarray(0, 11)); //20 + 11 > 30
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data ?? res.body.message).toBeDefined();
    expect(fs.existsSync(path.join(TEMP_DIR, uploadId, "chunk1"))).toBe(false);

    const stillQuota = await uploadChunk(uploadId, 1, content.subarray(0, 10)); //20 + 10 = 30
    expect(stillQuota.status).toBe(200);
  });

  it("t9: chunks are rejected once the session is completed", async () => {
    const uploadId = await createUploadSession(1, "done.mp4", MP4_HEADER.length);
    await uploadChunk(uploadId, 0, MP4_HEADER);
    await request(app).post("/uploads/complete").send({ uploadId });

    const res = await uploadChunk(uploadId, 0, "BBB");
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("t10: merged bytes that are not a real video fail the magic number check", async () => {
    const uploadId = await createUploadSession(1, "fake.mp4", 3);

    //declared .mp4, actual bytes are plain text: passes size checks, fails magic numbers
    await uploadChunk(uploadId, 0, "AAA");
    const completeRes = await request(app).post("/uploads/complete").send({ uploadId });

    expect(completeRes.status).toBe(400);
    expect(completeRes.body.success).toBe(false);
    expect(completeRes.body.message).toContain("does not match an allowed video format");

    const finalFile = path.join(FINAL_DIR, `${uploadId}-fake.mp4`);
    expect(fs.existsSync(finalFile)).toBe(false);

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("FAILED");
  });

  it("t11: renamed executable payload fails the magic number check", async () => {
    const uploadId = await createUploadSession(2, "renamed.mp4", MP4_HEADER.length);

    //attacker renames virus.exe to video.mp4 and shards the PE header across chunks:
    //extension check passes at initiate, magic numbers catch it at merge
    const exeBytes = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(MP4_HEADER.length - 2)]);
    await uploadChunk(uploadId, 0, exeBytes.subarray(0, exeBytes.length / 2));
    await uploadChunk(uploadId, 1, exeBytes.subarray(exeBytes.length / 2));

    const completeRes = await request(app).post("/uploads/complete").send({ uploadId });
    expect(completeRes.status).toBe(400);
    expect(completeRes.body.message).toContain("does not match an allowed video format");

    expect(fs.existsSync(path.join(FINAL_DIR, `${uploadId}-renamed.mp4`))).toBe(false);
    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("FAILED");
  });

  it("t12: complete succeeds when the declared sha256 checksum matches", async () => {
    const uploadId = await createUploadSession(2, "hashed.mp4", MP4_HEADER.length);
    await uploadChunk(uploadId, 0, MP4_HEADER.subarray(0, MP4_HEADER.length / 2));
    await uploadChunk(uploadId, 1, MP4_HEADER.subarray(MP4_HEADER.length / 2));

    const checksum = crypto.createHash("sha256").update(MP4_HEADER).digest("hex");
    const completeRes = await request(app).post("/uploads/complete").send({ uploadId, checksum });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);
    expect(fs.existsSync(path.join(FINAL_DIR, `${uploadId}-hashed.mp4`))).toBe(true);
    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("COMPLETED");
  });

  it("t12.1: complete fails and cleans up when the declared sha256 checksum does not match", async () => {
    const uploadId = await createUploadSession(2, "tampered.mp4", MP4_HEADER.length);
    await uploadChunk(uploadId, 0, MP4_HEADER.subarray(0, MP4_HEADER.length / 2));
    await uploadChunk(uploadId, 1, MP4_HEADER.subarray(MP4_HEADER.length / 2));

    const wrongChecksum = crypto.createHash("sha256").update("not the uploaded bytes").digest("hex");
    const completeRes = await request(app).post("/uploads/complete").send({ uploadId, checksum: wrongChecksum });

    expect(completeRes.status).toBe(400);
    expect(completeRes.body.message).toContain("does not match the declared checksum");
    expect(fs.existsSync(path.join(FINAL_DIR, `${uploadId}-tampered.mp4`))).toBe(false);

    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    expect(session?.status).toBe("FAILED");
  });
});