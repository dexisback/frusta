-- CreateEnum
CREATE TYPE "uploadStatus" AS ENUM ('INITIATED', 'UPLOADING', 'COMPLETING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "uploadSession" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "status" "uploadStatus" NOT NULL DEFAULT 'INITIATED',
    "mergeStartedAt" TIMESTAMP(3),
    "mergeCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploadChunk" (
    "id" TEXT NOT NULL,
    "uploadSessionId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploadChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploadSession_status_idx" ON "uploadSession"("status");

-- CreateIndex
CREATE INDEX "uploadChunk_uploadSessionId_idx" ON "uploadChunk"("uploadSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "uploadChunk_uploadSessionId_chunkIndex_key" ON "uploadChunk"("uploadSessionId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "uploadChunk" ADD CONSTRAINT "uploadChunk_uploadSessionId_fkey" FOREIGN KEY ("uploadSessionId") REFERENCES "uploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
