# Frusta Test Coverage Guide

## Test Inventory

- Total tests: 62
- Integration tests: 18 (`tests/integration/upload.integration.test.ts`)
- Unit tests: 44
  - Controller unit tests: 13 (`tests/unit/upload.controller.unit.test.ts`)
  - Service unit tests: 10 (`tests/unit/upload.service.unit.test.ts`)
  - Schema unit tests: 21 (`tests/unit/upload.schema.unit.test.ts`)

## Runtime Path Under Test

All integration tests call the real Express app and route stack:

- App wiring: `src/app.ts:8-13`
- Upload routes: `src/modules/uploads/uploads.routes.ts:6-9`

During tests, the DB client uses in-memory Prisma behavior by default:

- Switch logic: `src/db/prisma.ts:168-173`
- In-memory `uploadSession` behavior: `src/db/prisma.ts:32-90`
- In-memory `uploadChunk` behavior: `src/db/prisma.ts:92-163`

This means integration tests cover HTTP + controller + service + filesystem logic, but not real external database/network I/O unless `FRUSTA_TEST_USE_REAL_DB=true`.

## Integration Tests (18)

### File: `tests/integration/upload.integration.test.ts`

| Test | What It Verifies |
|---|---|
| `t1: upload session initialisation` | `POST /uploads/initiate` creates upload session, stores metadata, and creates temp upload dir |
| `t2: chunk upload test` | First chunk upload succeeds, chunk file exists, chunk DB row exists, session transitions to `UPLOADING` |
| `t3:unordered chunk upload` | Out-of-order chunk uploads are accepted and counted correctly |
| `t3.1: status endpoint returns uploaded chunks` | `GET /uploads/:uploadId/status` returns sorted uploaded chunk indexes and upload status |
| `t4: complete and merge` | `POST /uploads/complete` merges chunks in order, writes final file, cleans temp dir, marks session `COMPLETED` |
| `t5: invalid chunk index rejection` | Rejects chunk index `>= totalChunks`; no invalid chunk file and no chunk row are created |
| `t6: path traversal fileName is rejected with field details` | Rejects `../../` traversal fileName with a per-field error and no session created |
| `t6.1: disallowed file extension is rejected` | Rejects `.exe`, `.txt`, and double extensions (`.mp4.exe`) via the video extension allowlist |
| `t7: chunk without a content-length header is rejected` | Chunked transfer-encoding requests (no `content-length`) get `411`, nothing stored |
| `t7.1: zero-length chunk is rejected` | `content-length: 0` chunks get `400`, nothing stored |
| `t7.2: chunk with a parsed content-type is rejected` | Non-octet-stream content types (e.g. JSON) get `415` so the body parser cannot desync the stream |
| `t8: chunk exceeding the size limit is rejected` | Chunk larger than `MAX_CHUNK_SIZE_BYTES` gets `413`, nothing stored |
| `t8.1: chunk exceeding the declared fileSize quota is rejected` | A chunk that would push the uploaded total past the declared `fileSize` gets `400` before any write |
| `t9: chunks are rejected once the session is completed` | Chunk to a `COMPLETED` session gets `409` |
| `t10: merged bytes that are not a real video fail the magic number check` | Text bytes declared as `.mp4` pass size checks but fail `file-type` detection at complete; final file deleted, session `FAILED` |
| `t11: renamed executable payload fails the magic number check` | PE (`MZ`) bytes sharded across chunks under a `.mp4` name are caught at complete; file deleted, session `FAILED` |
| `t12: complete succeeds when the declared sha256 checksum matches` | Valid checksum path verifies merged bytes and completes |
| `t12.1: complete fails when the declared sha256 checksum does not match` | Tampered content declared as a checksum mismatch gets `400`; final file deleted, session `FAILED` |

## Content-Level Validation Layers

Implemented in `src/modules/uploads/fileValidator.service.ts` + schema/controller guards, mirroring the inspiration pipeline's image checks (`middleware/upload.ts` mimetype filter + `utils/file.ts` magic-number validation), adapted for a streaming chunked uploader:

1. **Extension allowlist** (initiate): only `.mp4/.m4v/.webm/.mkv/.mov` may be declared — `uploads.schema.ts`
2. **Magic numbers** (post-merge): `file-type` detects the true container from raw bytes; anything that is not an allowed video mime is rejected — `fileValidator.service.ts`
3. **sha256 checksum** (complete, optional): uploader-declared digest is verified against the merged bytes by streaming hash — `fileValidator.service.ts`
4. **Merged size verification** (post-merge): merged bytes must exactly equal the declared `fileSize` — `uploads.service.ts`
5. **Per-chunk quota** (chunk): chunk may not push the uploaded total past the declared `fileSize` — `uploads.controller.ts`
6. **Content-type gate** (chunk): bodies must be `application/octet-stream`, otherwise the JSON body parser consumes the stream and an empty file would be written — `uploads.controller.ts`

## Unit Tests: Controller (13)

### File: `tests/unit/upload.controller.unit.test.ts`

| Test | Test Line | What It Verifies | Source Lines Covered |
|---|---:|---|---|
| `initiate success returns 201` | `64` | Successful initiate flow returns `201` and calls session create + upload dir prep | Controller `src/modules/uploads/uploads.controller.ts:10-27` |
| `initiate invalid body returns 400` | `80` | Invalid initiate body raises validation error | Controller validation `src/modules/uploads/uploads.controller.ts:11-14`, schema `src/modules/uploads/uploads.schema.ts:23-27` |
| `chunk invalid query returns 400` | `91` | Missing/invalid chunk query is rejected | Controller query validation `src/modules/uploads/uploads.controller.ts:37-38`, schema `src/modules/uploads/uploads.schema.ts:8-11` |
| `chunk invalid index returns 400` | `102` | Chunk index outside valid range is rejected | Range guard `src/modules/uploads/uploads.controller.ts:45-47` |
| `chunk success updates status from INITIATED` | `119` | First chunk changes status to `UPLOADING` and returns success payload | Status transition `src/modules/uploads/uploads.controller.ts:50-52`, chunk path `src/modules/uploads/uploads.controller.ts:56-71` |
| `chunk deletes file when db write fails` | `148` | If DB insert fails after chunk write, chunk cleanup is called | Controller rollback `src/modules/uploads/uploads.controller.ts:56-68`, delete helper `src/modules/uploads/uploads.service.ts:55-59` |
| `complete returns 400 when chunks are missing` | `172` | Complete endpoint rejects when uploaded chunk count is incomplete | Guard `src/modules/uploads/uploads.controller.ts:87-88` |
| `complete success merges and marks completed` | `190` | Complete endpoint performs merge and transitions to `COMPLETED` | Complete happy path `src/modules/uploads/uploads.controller.ts:90-110` |
| `complete marks upload as FAILED when merge fails` | `212` | Merge failure path transitions upload state to `FAILED` | Failure branch `src/modules/uploads/uploads.controller.ts:112-114` |
| `status returns upload state` | `239` | Status endpoint returns session data + uploaded chunk indexes | Status endpoint `src/modules/uploads/uploads.controller.ts:118-149` |

## Unit Tests: Service (10)

### File: `tests/unit/upload.service.unit.test.ts`

| Test | Test Line | What It Verifies | Source Lines Covered |
|---|---:|---|---|
| `prepareUploadDir creates directory when missing` | `49` | Per-upload temp dir is created when absent | `src/modules/uploads/uploads.service.ts:28-34` |
| `storeChunk skips when chunk already exists` | `58` | Existing chunk short-circuits write operation | `src/modules/uploads/uploads.service.ts:41` |
| `storeChunk writes chunk when missing` | `72` | Chunk is written to temp file and renamed atomically | `src/modules/uploads/uploads.service.ts:43-48` |
| `storeChunk deletes temp file when pipeline fails` | `90` | Failed stream write removes temporary `.part` file | `src/modules/uploads/uploads.service.ts:45-52` |
| `deleteChunk removes chunk and temp chunk files` | `107` | Cleanup helper removes both final and temp chunk files | `src/modules/uploads/uploads.service.ts:55-59` |
| `mergeChunks throws when session is missing` | `117` | Merge refuses to continue for invalid/missing upload session | `src/modules/uploads/uploads.service.ts:64-69` |
| `mergeChunks happy path merges and cleans temp dir` | `123` | Ordered merge of all chunk files, atomic rename, temp dir cleanup | `src/modules/uploads/uploads.service.ts:76-97` |

## Unit Tests: Schema (21)

### File: `tests/unit/upload.schema.unit.test.ts`

| Test | Test Line | What It Verifies | Source Lines Covered |
|---|---:|---|---|
| `accepts a valid initiate payload` | `9` | Valid initiate payload passes schema validation | `src/modules/uploads/uploads.schema.ts:23-27` |
| `rejects invalid fileSize` | `19` | `fileSize <= 0` is rejected | `src/modules/uploads/uploads.schema.ts:25` |
| `rejects invalid totalChunks` | `29` | `totalChunks <= 0` is rejected | `src/modules/uploads/uploads.schema.ts:26` |
| `accepts a valid chunk query` | `39` | Valid chunk query (`uuid`, non-negative index) passes | `src/modules/uploads/uploads.schema.ts:8-11` |
| `rejects invalid chunk query (bad uuid/negative index)` | `48` | Invalid `uploadId` or negative index fails validation | `src/modules/uploads/uploads.schema.ts:8-11` |
| `accepts a valid complete payload` | `57` | Valid complete payload passes validation | `src/modules/uploads/uploads.schema.ts:14-16` |
---

## Coverage Notes

1. Strong coverage exists for upload happy paths and key failure branches in controller/service.
2. Missing branch coverage still exists for status endpoint error branches in tests:
   - Invalid status param validation path: `src/modules/uploads/uploads.controller.ts:119-122`
   - Unknown upload id in status endpoint: `src/modules/uploads/uploads.controller.ts:130-132`
3. NOTE: Integration tests are fast partly because DB behavior is in-memory during test mode (`src/db/prisma.ts:168-173`).
