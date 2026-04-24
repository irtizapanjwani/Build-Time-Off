/**
 * Application Configuration
 * 
 * Centralized, validated configuration derived from environment variables.
 * Maps all 9 TRD-specified env vars (Section 13.1) into a typed config object
 * consumed via NestJS ConfigModule.
 */
import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  path: process.env.DATABASE_PATH || './data/timeoff.db',
}));

export const hcmConfig = registerAs('hcm', () => ({
  baseUrl: process.env.HCM_BASE_URL || 'http://localhost:4000/hcm',
  apiKey: process.env.HCM_API_KEY || '',
  webhookSecret: process.env.HCM_WEBHOOK_SECRET || '',
  timeoutMs: parseInt(process.env.HCM_TIMEOUT_MS, 10) || 5000,
  circuitThreshold: parseInt(process.env.HCM_CIRCUIT_THRESHOLD, 10) || 5,
}));

export const jobsConfig = registerAs('jobs', () => ({
  reconciliationIntervalMs: parseInt(process.env.RECONCILIATION_INTERVAL_MS, 10) || 900000,
}));

export const idempotencyConfig = registerAs('idempotency', () => ({
  ttlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400,
}));

export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
}));
