import axios from "axios";
import { normalizeApiError } from "@/lib/api/error-handler";

const performanceLoggingEnabled =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_PERFORMANCE === "true";

export const apiClient = axios.create({
  baseURL: "/api/backend",
  timeout: 20000,
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => {
    if (performanceLoggingEnabled) {
      const responseTime = response.headers["x-response-time-ms"];
      const queryCount = response.headers["x-db-query-count"];
      if (responseTime || queryCount) {
        console.debug("[api-performance]", {
          requestId: response.headers["x-request-id"] ?? null,
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          responseTimeMs: responseTime ?? null,
          queryCount: queryCount ?? null,
          serverTiming: response.headers["server-timing"] ?? null,
        });
      }
    }
    return response;
  },
  async (error) => Promise.reject(normalizeApiError(error)),
);
