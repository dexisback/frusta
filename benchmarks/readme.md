# benchmarking onboard guide:


### what are we testing?
We are testing the full upload lifecycle of a file. From being in a single piece in client, to chunked, to the final merge

### endpoints:
POST /uploads/initiate
POST /uploads/chunk
POST /uploads/complete
GET /uploads/:uploadId/status

We measure metrics like:
- requestLatency
- throughput
- error rate
- full upload success rate


----

