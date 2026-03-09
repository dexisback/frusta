import "dotenv/config";
import crypto from "node:crypto";
import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";

type UploadStatus = "INITIATED" | "UPLOADING" | "COMPLETING" | "COMPLETED" | "FAILED";

type UploadSessionRecord = {
  id: string;
  fileName: string;
  fileSize: bigint;
  totalChunks: number;
  status: UploadStatus;
  mergeStartedAt: Date | null;
  mergeCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type UploadChunkRecord = {
  id: string;
  uploadSessionId: string;
  chunkIndex: number;
  size: number;
  createdAt: Date;
};

class InMemoryPrisma {
  private readonly sessions = new Map<string, UploadSessionRecord>();
  private readonly chunks = new Map<string, UploadChunkRecord>();

  uploadSession = {
    create: async ({ data }: { data: { fileName: string; fileSize: bigint; totalChunks: number; status: UploadStatus } }) => {
      const id = crypto.randomUUID();
      const now = new Date();
      const session: UploadSessionRecord = {
        id,
        fileName: data.fileName,
        fileSize: BigInt(data.fileSize),
        totalChunks: Number(data.totalChunks),
        status: data.status,
        mergeStartedAt: null,
        mergeCompletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.sessions.set(id, session);
      return session;
    },
    findUnique: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: Record<string, boolean>;
    }) => {
      const row = this.sessions.get(where.id) ?? null;
      if (!row) {
        return null;
      }
      if (!select) {
        return row;
      }
      const selected: Record<string, unknown> = {};
      for (const [key, enabled] of Object.entries(select)) {
        if (enabled) {
          selected[key] = row[key as keyof UploadSessionRecord];
        }
      }
      return selected;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UploadSessionRecord> }) => {
      const existing = this.sessions.get(where.id);
      if (!existing) {
        throw new Error("upload session not found");
      }
      const next: UploadSessionRecord = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.sessions.set(where.id, next);
      return next;
    },
    deleteMany: async () => {
      this.sessions.clear();
      this.chunks.clear();
      return { count: 0 };
    },
  };

  uploadChunk = {
    createMany: async ({
      data,
      skipDuplicates,
    }: {
      data: Array<{ uploadSessionId: string; chunkIndex: number; size: number }>;
      skipDuplicates?: boolean;
    }) => {
      let inserted = 0;
      for (const row of data) {
        const key = `${row.uploadSessionId}:${row.chunkIndex}`;
        if (this.chunks.has(key)) {
          if (skipDuplicates) {
            continue;
          }
          throw new Error("duplicate chunk");
        }
        const chunk: UploadChunkRecord = {
          id: crypto.randomUUID(),
          uploadSessionId: row.uploadSessionId,
          chunkIndex: row.chunkIndex,
          size: row.size,
          createdAt: new Date(),
        };
        this.chunks.set(key, chunk);
        inserted += 1;
      }
      return { count: inserted };
    },
    findFirst: async ({ where }: { where: { uploadSessionId: string; chunkIndex: number } }) => {
      return this.chunks.get(`${where.uploadSessionId}:${where.chunkIndex}`) ?? null;
    },
    count: async ({ where }: { where: { uploadSessionId: string } }) => {
      let count = 0;
      for (const chunk of this.chunks.values()) {
        if (chunk.uploadSessionId === where.uploadSessionId) {
          count += 1;
        }
      }
      return count;
    },
    findMany: async ({
      where,
      select,
      orderBy,
    }: {
      where: { uploadSessionId: string };
      select?: Record<string, boolean>;
      orderBy?: { chunkIndex?: "asc" | "desc" };
    }) => {
      const rows = [...this.chunks.values()].filter((chunk) => chunk.uploadSessionId === where.uploadSessionId);
      rows.sort((a, b) =>
        orderBy?.chunkIndex === "desc" ? b.chunkIndex - a.chunkIndex : a.chunkIndex - b.chunkIndex,
      );
      if (!select) {
        return rows;
      }
      return rows.map((row) => {
        const selected: Record<string, unknown> = {};
        for (const [key, enabled] of Object.entries(select)) {
          if (enabled) {
            selected[key] = row[key as keyof UploadChunkRecord];
          }
        }
        return selected;
      });
    },
    deleteMany: async () => {
      this.chunks.clear();
      return { count: 0 };
    },
  };

  async $disconnect() {}
}

const useInMemoryDb =
  process.env.NODE_ENV === "test" && process.env.FRUSTA_TEST_USE_REAL_DB !== "true";

function createPrisma() {
  if (useInMemoryDb) {
    return new InMemoryPrisma();
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when not using in-memory test DB");
  }

  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient | InMemoryPrisma | any = createPrisma();
