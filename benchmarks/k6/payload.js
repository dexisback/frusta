function splitIntoChunks(content, chunkSize) {
  const chunks = [];

  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }

  return chunks;
}

export function buildUploadPlan() {
  const chunkSize = Math.max(Number(__ENV.CHUNK_SIZE || 8), 1);
  const fileName = `sample-${__VU}-${__ITER}.txt`;
  const fileContent = `hello from k6 | vu=${__VU} iter=${__ITER} ${Date.now()}`;
  const chunks = splitIntoChunks(fileContent, chunkSize);

  return {
    fileName,
    fileSize: fileContent.length,
    totalChunks: chunks.length,
    chunks,
  };
}
