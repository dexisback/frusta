import { check } from "k6";

function safeJson(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

export function checkInitiateResponse(res) {
  return check(res, {
    "initiate status is 201": (r) => r.status === 201,
    "initiate success is true": (r) => safeJson(r)?.success === true,
    "initiate has uploadId": (r) => Boolean(safeJson(r)?.data?.uploadId),
  });
}

export function checkChunkResponse(res) {
  return check(res, {
    "chunk status is 200": (r) => r.status === 200,
    "chunk success is true": (r) => safeJson(r)?.success === true,
  });
}

export function checkStatusResponse(res, totalChunks) {
  return check(res, {
    "status endpoint status is 200": (r) => r.status === 200,
    "status success is true": (r) => safeJson(r)?.success === true,
    "status has uploadedChunks array": (r) =>
      Array.isArray(safeJson(r)?.data?.uploadedChunks),
    "status totalChunks matches": (r) =>
      Number(safeJson(r)?.data?.totalChunks) === Number(totalChunks),
  });
}

export function checkCompleteResponse(res) {
  return check(res, {
    "complete status is 200": (r) => r.status === 200,
    "complete success is true": (r) => safeJson(r)?.success === true,
  });
}
