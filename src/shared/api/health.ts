export interface HealthResponse {
  status: 'ok';
  service: 'photo-wall';
  startedAt: string;
  uptimeSeconds: number;
  version: string;
}

export const HEALTHZ_PATH = '/healthz';
