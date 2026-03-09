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
