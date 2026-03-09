import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/prisma.js", () => ({
  prisma: {
    uploadSession: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("stream/promises", () => ({
  pipeline: vi.fn(),
}));

vi.mock("fs", () => {
  const fsMock = {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(),
    createReadStream: vi.fn(),
    promises: {
      mkdir: vi.fn(),
      rename: vi.fn(),
      rm: vi.fn(),
    },
  };

  return { default: fsMock };
});

import fs from "fs";
import { pipeline } from "stream/promises";
import { prisma } from "../../src/db/prisma";
import {
  deleteChunk,
  mergeChunks,
  prepareUploadDir,
  storeChunk,
} from "../../src/modules/uploads/uploads.service";

describe("uploads.service unit", () => {
  const uploadId = "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it("prepareUploadDir creates directory when missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined as any);

    await prepareUploadDir(uploadId);

    expect(fs.promises.mkdir).toHaveBeenCalledTimes(1);
  });

  it("storeChunk skips when chunk already exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const written = await storeChunk({
      uploadId,
      chunkIndex: 0,
      reqStream: {} as any,
    });

    expect(written).toBe(false);
    expect(fs.createWriteStream).not.toHaveBeenCalled();
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("storeChunk writes chunk when missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.createWriteStream).mockReturnValue({} as any);
    vi.mocked(pipeline).mockResolvedValue(undefined as any);
    vi.mocked(fs.promises.rename).mockResolvedValue(undefined as any);

    const written = await storeChunk({
      uploadId,
      chunkIndex: 1,
      reqStream: { some: "stream" } as any,
    });

    expect(written).toBe(true);
    expect(fs.createWriteStream).toHaveBeenCalledTimes(1);
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(fs.promises.rename).toHaveBeenCalledTimes(1);
  });

  it("storeChunk deletes temp file when pipeline fails", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.createWriteStream).mockReturnValue({} as any);
    vi.mocked(pipeline).mockRejectedValue(new Error("stream failed"));
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined as any);

    await expect(
      storeChunk({
        uploadId,
        chunkIndex: 2,
        reqStream: { some: "stream" } as any,
      }),
    ).rejects.toThrow("stream failed");

    expect(fs.promises.rm).toHaveBeenCalledWith(expect.stringContaining("chunk2.part"), { force: true });
  });

  it("deleteChunk removes chunk and temp chunk files", async () => {
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined as any);

    await deleteChunk({ uploadId, chunkIndex: 3 });

    expect(fs.promises.rm).toHaveBeenCalledTimes(2);
    expect(fs.promises.rm).toHaveBeenNthCalledWith(1, expect.stringContaining("chunk3"), { force: true });
    expect(fs.promises.rm).toHaveBeenNthCalledWith(2, expect.stringContaining("chunk3.part"), { force: true });
  });

  it("mergeChunks throws when session is missing", async () => {
    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue(null);

    await expect(mergeChunks({ uploadId })).rejects.toThrow("upload session not found");
  });

  it("mergeChunks happy path merges and cleans temp dir", async () => {
    const writeStream = {
      end: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        if (event === "finish") {
          setImmediate(cb);
        }
        return writeStream;
      }),
    };

    vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
      id: uploadId,
      fileName: "merge.txt",
      totalChunks: 2,
    } as any);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.createWriteStream).mockReturnValue(writeStream as any);
    vi.mocked(fs.createReadStream).mockReturnValue({} as any);
    vi.mocked(pipeline).mockResolvedValue(undefined as any);
    vi.mocked(fs.promises.rename).mockResolvedValue(undefined as any);
    vi.mocked(fs.promises.rm).mockResolvedValue(undefined as any);

    await mergeChunks({ uploadId });

    expect(fs.createReadStream).toHaveBeenCalledTimes(2);
    expect(pipeline).toHaveBeenCalledTimes(2);
    expect(fs.promises.rename).toHaveBeenCalledTimes(1);
    expect(fs.promises.rm).toHaveBeenCalledTimes(1);
  });
});
