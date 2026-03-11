import http from "k6/http";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_TOKEN = __ENV.API_TOKEN || "";

function buildHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };

  if (API_TOKEN) {
    headers.Authorization = `Bearer ${API_TOKEN}`;
  }

  return headers;
}

export function initiateUpload(payload) {
  return http.post(`${BASE_URL}/uploads/initiate`, JSON.stringify(payload), {
    headers: buildHeaders({ "Content-Type": "application/json" }),
    tags: { name: "upload_initiate" },
  });
}

export function uploadChunk(uploadId, chunkIndex, body) {
  const encodedUploadId = encodeURIComponent(uploadId);
  const url = `${BASE_URL}/uploads/chunk?uploadId=${encodedUploadId}&chunkIndex=${chunkIndex}`;

  return http.post(url, body, {
    headers: buildHeaders({ "Content-Type": "application/octet-stream" }),
    tags: { name: "upload_chunk" },
  });
}

export function getUploadStatus(uploadId) {
  const encodedUploadId = encodeURIComponent(uploadId);
  return http.get(`${BASE_URL}/uploads/${encodedUploadId}/status`, {
    headers: buildHeaders(),
    tags: { name: "upload_status" },
  });
}

export function completeUpload(uploadId) {
  return http.post(
    `${BASE_URL}/uploads/complete`,
    JSON.stringify({ uploadId }),
    {
      headers: buildHeaders({ "Content-Type": "application/json" }),
      tags: { name: "upload_complete" },
    },
  );
}
