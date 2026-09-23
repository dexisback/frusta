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
      fileName: "tiny.mp4",
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
      fileName: `${"a".repeat(252)}.mp4`, //252 + 4 = 256 characters
      fileSize: 10,
      totalChunks: 2,
    });

    expect(result.success).toBe(false);
  });

  it("accepts every allowed video extension", () => {
    for (const fileName of ["a.mp4", "a.m4v", "a.webm", "a.mkv", "a.MOV"]) {
      const result = incomingSandeshaSchema.safeParse({
        fileName,
        fileSize: 10,
        totalChunks: 2,
      });

      expect(result.success).toBe(true);
    }
  });

  it("rejects non-video extensions, double extensions and missing extensions", () => {
    for (const fileName of ["notes.txt", "payload.exe", "movie.mp4.exe", "noextension"]) {
      const result = incomingSandeshaSchema.safeParse({
        fileName,
        fileSize: 10,
        totalChunks: 2,
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects fileSize above the limit", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "huge.mp4",
      fileSize: String(5n * 1024n * 1024n * 1024n + 1n),
      totalChunks: 10000,
    });

    expect(result.success).toBe(false);
  });

  it("rejects totalChunks above the limit", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "many.mp4",
      fileSize: 10001,
      totalChunks: 10001,
    });

    expect(result.success).toBe(false);
  });

  it("rejects totalChunks larger than the file itself", () => {
    const result = incomingSandeshaSchema.safeParse({
      fileName: "bad-plan.mp4",
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

describe("uploads.schema checksum validation", () => {
  it("accepts a valid sha256 hex checksum", () => {
    const result = completedSandeshaSchema.safeParse({
      uploadId: "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a",
      checksum: "a".repeat(64),
    });

    expect(result.success).toBe(true);
  });

  it("accepts an omitted checksum", () => {
    const result = completedSandeshaSchema.safeParse({
      uploadId: "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a",
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed checksums", () => {
    for (const checksum of ["a".repeat(63), `z${"a".repeat(63)}`, "a".repeat(65)]) {
      const result = completedSandeshaSchema.safeParse({
        uploadId: "7d6be4f4-c97a-4abe-b0ce-4050bbceee5a",
        checksum,
      });

      expect(result.success).toBe(false);
    }
  });
});
