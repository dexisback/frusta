#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
VUS="${VUS:-5}"
DURATION="${DURATION:-30s}"
SLEEP_SECONDS="${SLEEP_SECONDS:-1}"
CHUNK_SIZE="${CHUNK_SIZE:-8}"

k6 run \
  -e BASE_URL="$BASE_URL" \
  -e VUS="$VUS" \
  -e DURATION="$DURATION" \
  -e SLEEP_SECONDS="$SLEEP_SECONDS" \
  -e CHUNK_SIZE="$CHUNK_SIZE" \
  benchmarks/k6/upload-flow.js
