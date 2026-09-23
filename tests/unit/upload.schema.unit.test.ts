import { describe, it, expect } from "vitest";
import {
  chunkQuerySchema,
  completedSandeshaSchema,
  incomingSandeshaSchema,
} from "../../src/modules/uploads/uploads.schema";

describe("uploads.schema unit", () => {
  it("accepts a valid initiate payload", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "video.mp4",
      fileSize: "123",
      totalChunks: "4",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid fileSize", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "video.mp4",
      fileSize: 0,
      totalChunks: 2,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid totalChunks", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "video.mp4",
      fileSize: 10,
      totalChunks: 0,
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid chunk query", () => {
    const result = chunkQuerySchema.safeParse({
      uploadId: "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a",
      chunkIndex: "0",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid chunk query (bad uuid/negative index)", () => {
    const result = chunkQuerySchema.safeParse({
      uploadId: "not-a-uuid",
      chunkIndex: -1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid complete payload", () => {
    const result = completedSandeshaSchema.safeParse({
      uploadId: "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a",
    });

    expect(result.success).toBe(true);
  });
});

describe("uploads.schema validation hardening", () => {
  it("accepts a 1-byte-per-chunk upload", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "tiny.txt",
      fileSize: 3,
      totalChunks: 3,
    });

    expect(result.success).toBe(true);
  });

  it("rejects path traversal in fileName", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "../../etc/cron.d/pwned",
      fileSize: 10,
      totalChunks: 2,
    });

    expect(result.success).toBe(false);
  });

  it("rejects backslashes and control characters in fileName", () => {
    for (const fileName of ["a\\b", "bad\u0000name", "name\u001f"]) {
      const result = incomingSandeshaSchema.safeParse({
        fileName,
        fileSize: 10,
        totalChunks: 2,
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects fileName longer than the limit", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "a".repeat(256),
      fileSize: 10,
      totalChunks: 2,
    });

    expect(result.success).toBe(false);
  });

  it("rejects fileSize above the limit", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "huge.iso",
      fileSize: String(5n * 1024n * 1024n * 1024n + 1n),
      totalChunks: 10000,
    });

    expect(result.success).toBe(false);
  });

  it("rejects totalChunks above the limit", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "many.txt",
      fileSize: 10001,
      totalChunks: 10001,
    });

    expect(result.success).toBe(false);
  });

  it("rejects totalChunks larger than the file itself", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "bad-plan.txt",
      fileSize: 2,
      totalChunks: 3,
    });

    expect(result.success).toBe(false);
  });

  it("rejects chunkIndex above the chunk limit", () => {
    const result = chunkQuerySchema.safeParse({
      uploadId: "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a",
      chunkIndex: 10_001,
    });

    expect(result.success).toBe(false);
  });
});
