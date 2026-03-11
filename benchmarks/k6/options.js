const vus = Number(__ENV.VUS || 5);
const duration = __ENV.DURATION || "30s";

export const options = {
  vus,
  duration,
  thresholds: {
    http_req_duration: ["p(95)<2500"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};
