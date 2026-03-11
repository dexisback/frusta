export { options } from "./options.js";

import { sleep } from "k6";
import { buildUploadPlan } from "./payload.js";
import {
  checkInitiateResponse,
  checkChunkResponse,
  checkStatusResponse,
  checkCompleteResponse,
} from "./checks.js";
import {
  initiateUpload,
  uploadChunk,
  getUploadStatus,
  completeUpload,
} from "./api.js";

function readUploadId(response) {
  try {
    return response.json()?.data?.uploadId || null;
  } catch (_) {
    return null;
  }
}

export default function () {
  const plan = buildUploadPlan();

  const initiateRes = initiateUpload({
    fileName: plan.fileName,
    fileSize: plan.fileSize,
    totalChunks: plan.totalChunks,
  });

  if (!checkInitiateResponse(initiateRes)) {
    sleep(1);
    return;
  }

  const uploadId = readUploadId(initiateRes);
  if (!uploadId) {
    sleep(1);
    return;
  }

  for (let chunkIndex = 0; chunkIndex < plan.chunks.length; chunkIndex += 1) {
    const chunkRes = uploadChunk(uploadId, chunkIndex, plan.chunks[chunkIndex]);
    if (!checkChunkResponse(chunkRes)) {
      sleep(1);
      return;
    }
  }

  const statusRes = getUploadStatus(uploadId);
  checkStatusResponse(statusRes, plan.totalChunks);

  const completeRes = completeUpload(uploadId);
  checkCompleteResponse(completeRes);

  sleep(Number(__ENV.SLEEP_SECONDS || 1));
}
