import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/prisma.js", () => ({
  prisma: {
    uploadSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    uploadChunk: {
      createMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/uploads/uploads.service.js", () => ({
  prepareUploadDir: vi.fn(),
  storeChunk: vi.fn(),
  mergeChunks: vi.fn(),
}));

import { prisma } from "../../src/db/prisma";
import { UPLOAD_STATUS } from "../../src/modules/uploads/uploads.constants";
import {
  chunkController,
  completedController,
  initiateController,
} from "../../src/modules/uploads/uploads.controller";
import {
  mergeChunks,
  prepareUploadDir,
  storeChunk,
} from "../../src/modules/uploads/uploads.service";

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function runHandler(
  handler: (req: any, res: any, next: any) => void,
  req: any,
  res: any,
  next: any,
) {
  handler(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
}

describe("uploads.controller unit", () => {
  const uploadId = "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initiate success returns 201", async () => {
    const req = { body: { fileName: "a.txt", fileSize: 10, totalChunks: 3 } };
    const res = makeRes();
    const next = vi.fn();

    vi.mocked(prisma.uploadSession.create).mockResolvedValue({ id: uploadId } as any);
    vi.mocked(prepareUploadDir).mockResolvedValue(undefined);

    await runHandler(initiateController, req, res, next);

    expect(prisma.uploadSession.create).toHaveBeenCalledTimes(1);
    expect(prepareUploadDir).toHaveBeenCalledWith(uploadId);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it("initiate invalid body returns 400", async () => {
    const req = { body: { fileName: "", fileSize: 0, totalChunks: 0 } };
    const res = makeRes();
    const next = vi.fn();

    await runHandler(initiateController, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it("chunk invalid query returns 400", async () => {
    const req = { query: {}, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    await runHandler(chunkController, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it("chunk invalid index returns 400", async () => {
    const req = { query: { uploadId, chunkIndex: 3 }, headers: {} };
    const res = makeRes();
    const next = vi.fn();

    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: uploadId,
      totalChunks: 3,
      status: UPLOAD_STATUS.INITIATED,
    } as any);

    await runHandler(chunkController, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it("chunk success updates status from INITIATED", async () => {
    const req = {
      query: { uploadId, chunkIndex: 0 },
      headers: { "content-length": "3" },
    };
    const res = makeRes();
    const next = vi.fn();

    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: uploadId,
      totalChunks: 3,
      status: UPLOAD_STATUS.INITIATED,
    } as any);
    vi.mocked(prisma.uploadSession.update).mockResolvedValue({} as any);
    vi.mocked(storeChunk).mockResolvedValue(undefined);
    vi.mocked(prisma.uploadChunk.createMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.uploadChunk.count).mockResolvedValue(1);

    await runHandler(chunkController, req, res, next);

    expect(prisma.uploadSession.update).toHaveBeenCalledWith({
      where: { id: uploadId },
      data: { status: UPLOAD_STATUS.UPLOADING },
    });
    expect(storeChunk).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("complete returns 400 when chunks are missing", async () => {
    const req = { body: { uploadId } };
    const res = makeRes();
    const next = vi.fn();

    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: uploadId,
      totalChunks: 3,
      status: UPLOAD_STATUS.UPLOADING,
    } as any);
    vi.mocked(prisma.uploadChunk.count).mockResolvedValue(2);

    await runHandler(completedController, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.statusCode).toBe(400);
  });

  it("complete success merges and marks completed", async () => {
    const req = { body: { uploadId } };
    const res = makeRes();
    const next = vi.fn();

    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: uploadId,
      totalChunks: 3,
      status: UPLOAD_STATUS.UPLOADING,
    } as any);
    vi.mocked(prisma.uploadChunk.count).mockResolvedValue(3);
    vi.mocked(prisma.uploadSession.update).mockResolvedValue({} as any);
    vi.mocked(mergeChunks).mockResolvedValue(undefined);

    await runHandler(completedController, req, res, next);

    expect(prisma.uploadSession.update).toHaveBeenCalledTimes(2);
    expect(mergeChunks).toHaveBeenCalledWith({ uploadId });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});
