import type { MiddlewareHandler } from 'hono';

/**
 * In-memory metrics store
 * Tracks request counts and response times for /v1/admin/metrics endpoint
 */
export class MetricsStore {
  private static instance: MetricsStore;
  private startTime: number;
  private requestCount: number;
  private totalResponseTime: number;

  private constructor() {
    this.startTime = Date.now();
    this.requestCount = 0;
    this.totalResponseTime = 0;
  }

  static getInstance(): MetricsStore {
    if (!MetricsStore.instance) {
      MetricsStore.instance = new MetricsStore();
    }
    return MetricsStore.instance;
  }

  trackRequest(duration: number): void {
    this.requestCount++;
    this.totalResponseTime += duration;
  }

  getMetrics() {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000), // seconds
      totalRequests: this.requestCount,
      averageResponseTime:
        this.requestCount > 0 ? Math.round(this.totalResponseTime / this.requestCount) : 0,
    };
  }

  reset(): void {
    this.startTime = Date.now();
    this.requestCount = 0;
    this.totalResponseTime = 0;
  }
}

/**
 * Metrics tracking middleware
 * Tracks request count and response time in-memory
 */
export const metricsTracker: MiddlewareHandler = async (c, next) => {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const metrics = MetricsStore.getInstance();
  metrics.trackRequest(duration);
};
