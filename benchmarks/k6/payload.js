function splitIntoChunks(content, chunkSize) {
  const chunks = [];

  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }

  return chunks;
}

//24-byte minimal ftyp box so the merged file passes server-side magic-number validation
//(every byte is ASCII-safe, so the utf8 encoding is exactly these bytes)
const MP4_HEADER = "\u0000\u0000\u0000\u0018ftypisom\u0000\u0000\u0000\u0000isommp42";

export function buildUploadPlan() {
  const chunkSize = Math.max(Number(__ENV.CHUNK_SIZE || 8), 1);
  const fileName = `sample-${__VU}-${__ITER}.mp4`;
  const fileContent = `${MP4_HEADER}hello from k6 | vu=${__VU} iter=${__ITER} ${Date.now()}`;
  const chunks = splitIntoChunks(fileContent, chunkSize);

  return {
    fileName,
    fileSize: fileContent.length,
    totalChunks: chunks.length,
    chunks,
  };
}
