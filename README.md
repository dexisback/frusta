# Frusta

![Node](https://img.shields.io/badge/node-20%2B-0b3d91?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-5.x-1f6feb?style=for-the-badge&logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-29%2F29%20passing-1f883d?style=for-the-badge)
![License](https://img.shields.io/badge/license-ISC-6f42c1?style=for-the-badge)

```text
______              _        
|  ___|            | |       
| |_ _ __ _   _ ___| |_ __ _ 
|  _| '__| | | / __| __/ _` |
| | | |  | |_| \__ \ || (_| |
\_| |_|   \__,_|___/\__\__,_|
```

`manual single-node chunking engine | s3-style upload semantics | resumable + idempotent`

Frusta is a manual, S3-style chunk upload engine built on Node.js + Express + Prisma.
It accepts out-of-order and parallel chunk uploads, supports resume, enforces idempotency, and merges to a final artifact using atomic file operations.

## What It Solves

- Upload large files reliably over unstable networks.
- Resume interrupted uploads without re-sending completed chunks.
- Prevent duplicate chunk corruption under retries/races.
- Keep merge and cleanup deterministic with explicit upload session states.

## Core Features

- Chunked upload lifecycle: `INITIATED -> UPLOADING -> COMPLETING -> COMPLETED | FAILED`
- Out-of-order chunk acceptance
- Parallel chunk upload support
- Resume support via uploaded-chunk introspection endpoint
- Duplicate chunk protection:
  - Filesystem guard (`chunkN` existence check)
  - DB uniqueness (`@@unique([uploadSessionId, chunkIndex])`)
  - `createMany(..., skipDuplicates: true)` idempotency
- Safe write path:
  - Chunk write to `.part` then atomic rename to `chunkN`
  - Final merge to `<uploadId>-<fileName>.part` then atomic rename to final file
- Automatic temp cleanup after successful merge
- Failure rollback in chunk ingest path (if DB write fails after file write, chunk file is removed)
- Zod request validation for body/query/params
- Centralized error and not-found middleware
- Request logging middleware with latency printouts
- Test-time in-memory Prisma fallback for fast deterministic integration testing

## Upload Flow

1. `POST /uploads/initiate` creates an upload session row and a temp directory for `uploadId`.
2. `POST /uploads/chunk` stores raw chunk bytes (`application/octet-stream`) by `chunkIndex`.
3. Clients can upload chunks in any order, retry safely, and in parallel.
4. `GET /uploads/:uploadId/status` returns `uploadedChunks[]` so clients resume only missing indexes.
5. `POST /uploads/complete` verifies `uploadedChunks === totalChunks`, merges in index order, atomically renames final artifact, then deletes temp chunk directory.

## API

Base path: `/uploads`

### 1) Initiate Upload

- `POST /uploads/initiate`
- Body:

```json
{
  "fileName": "video.mp4",
  "fileSize": 734003200,
  "totalChunks": 128
}
```

- Success: `201`

```json
{
  "success": true,
  "statusCode": 201,
  "message": "upload session initiated",
  "data": { "uploadId": "uuid" }
}
```

### 2) Upload Chunk

- `POST /uploads/chunk?uploadId=<uuid>&chunkIndex=<int>`
- Headers: `Content-Type: application/octet-stream`
- Body: raw chunk bytes
- Success: `200`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "chunk stored",
  "data": { "uploadedChunks": 42, "totalChunks": 128 }
}
```

### 3) Upload Status (Resume API)

- `GET /uploads/:uploadId/status`
- Success: `200`

```json
{
  "success": true,
  "statusCode": 200,
  "message": "upload status fetched",
  "data": {
    "uploadId": "uuid",
    "status": "UPLOADING",
    "uploadedChunks": [0, 1, 2, 5, 6],
    "totalChunks": 128
  }
}
```

### 4) Complete Upload

- `POST /uploads/complete`
- Body:

```json
{
  "uploadId": "uuid"
}
```

- Success: `200`
- Idempotent behavior: if already completed, returns `200` with `"upload already completed"`.

## Storage and Merge Semantics

- Root: `UPLOAD_ROOT` (default: `uploads`)
- Temp chunks: `uploads/temp/<uploadId>/chunk<index>`
- Final artifact: `uploads/final/<uploadId>-<fileName>`
- Chunk and final files are first written as `.part`, then atomically renamed.
- On merge success: temp chunk directory is recursively removed.

## Data Model (Prisma)

### `uploadSession`

- `id` (UUID, PK)
- `fileName`
- `fileSize` (`BigInt`)
- `totalChunks`
- `status` (`INITIATED | UPLOADING | COMPLETING | COMPLETED | FAILED`)
- `mergeStartedAt`, `mergeCompletedAt`
- `createdAt`, `updatedAt`
- Index: `status`

### `uploadChunk`

- `id` (UUID, PK)
- `uploadSessionId` (FK -> `uploadSession`, `onDelete: Cascade`)
- `chunkIndex`
- `size`
- `createdAt`
- Unique constraint: `(uploadSessionId, chunkIndex)`
- Index: `uploadSessionId`

## Project Structure

```text
src/
  app.ts                          # express app wiring + middleware + routes
  server.ts                       # process entrypoint
  config/env.ts                   # zod env validation
  db/prisma.ts                    # prisma client + in-memory test fallback
  middleware/
    requestLogger.middleware.ts
    notFound.middleware.ts
    errorHandler.middleware.ts
  modules/uploads/
    uploads.routes.ts             # upload route map
    uploads.schema.ts             # zod contracts
    uploads.controller.ts         # request orchestration
    uploads.service.ts            # fs/stream chunk + merge engine
    uploads.constants.ts          # status constants + storage paths
    uploads.types.ts
  utils/
    apiError.ts
    apiResponse.ts
    asyncHandler.ts

prisma/
  schema.prisma
  migrations/

tests/
  integration/upload.integration.test.ts
  unit/upload.controller.unit.test.ts
  unit/upload.service.unit.test.ts
  unit/upload.schema.unit.test.ts

benchmarks/
  k6/
    upload-flow.js
    api.js
    checks.js
    options.js
    payload.js
    run.sh
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
# .env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>
# optional:
# UPLOAD_ROOT=uploads
```

3. Apply DB schema:

```bash
npx prisma migrate deploy
```

4. Run:

```bash
npm run dev
```

## Environment Variables

- `NODE_ENV`: `development | test | production`
- `PORT`: HTTP port (default `3000`)
- `DATABASE_URL`: required unless using in-memory test mode
- `UPLOAD_ROOT` (optional): storage root (default `uploads`)
- `FRUSTA_TEST_USE_REAL_DB` (optional): when `true` in test mode, bypasses in-memory DB fallback

## NPM Scripts

- `npm run dev`: run server in watch mode via `tsx`
- `npm run test`: run full Vitest suite
- `npm run typecheck`: TypeScript type-check
- `npm run build`: build to `dist/`
- `npm run start`: run compiled server
- `npm run bench:k6:upload`: run k6 flow with env-driven params
- `npm run bench:k6:upload:local`: convenience local benchmark profile

## Testing

Run:

```bash
npm test
```

Current snapshot (run on March 12, 2026):

- `29/29` tests passing
- Unit: `23` (controller + service + schema)
- Integration: `6` (full HTTP upload flow)

Notes:

- In `NODE_ENV=test`, DB defaults to in-memory Prisma adapter unless `FRUSTA_TEST_USE_REAL_DB=true`.
- Integration tests cover upload initiation, chunk ingest, out-of-order behavior, status/resume API, complete/merge path, and invalid index rejection.

## Benchmark (k6) Snapshot

Script: `benchmarks/k6/upload-flow.js`

Run profile used:

- Date: March 12, 2026
- `BASE_URL=http://127.0.0.1:3000`
- `VUS=5`
- `DURATION=15s`
- `CHUNK_SIZE=8`
- `SLEEP_SECONDS=0`
- Server mode: `NODE_ENV=test` (in-memory DB path)

Observed results:

- Checks pass rate: `100%` (`126/126`)
- HTTP failure rate: `0.00%`
- Total HTTP requests: `54`
- Throughput: `1.86 req/s`
- `http_req_duration` avg: `1664.49 ms`
- `http_req_duration` p90: `2081.15 ms`
- `http_req_duration` p95: `2654.46 ms`
- Completed upload iterations: `6`

Threshold status for this run:

- `http_req_failed < 1%`: pass
- `checks > 99%`: pass
- `http_req_duration p95 < 2500ms`: narrowly missed (`2654.46ms`)

## Why This Design Holds Up

- Stream-based writes (`pipeline`) reduce memory pressure and give cleaner backpressure handling.
- Atomic renames protect against partial file visibility.
- Session/chunk split in DB keeps metadata clean and queryable.
- Idempotent chunk semantics make retries safe under network noise and client duplication.
- Controller/service separation keeps the upload engine modular and easy to evolve.

## License

This project is licensed under the ISC License.
See [LICENSE](/home/amaan/my_stuff/frusta/LICENSE).
