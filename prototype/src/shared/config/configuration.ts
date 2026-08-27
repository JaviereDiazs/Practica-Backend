import { registerAs } from '@nestjs/config';

// Grouped under namespaces so modules inject `ConfigType<typeof xConfig>`
// instead of reaching for loose `config.get('SOME_STRING')` calls.

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
}));

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
}));

export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  cacheTtlMs: parseInt(process.env.CACHE_TTL_MS ?? '30000', 10),
}));

export const rabbitmqConfig = registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL,
  exchange: process.env.RABBITMQ_EXCHANGE,
  queue: process.env.RABBITMQ_QUEUE,
}));

export const jobsConfig = registerAs('jobs', () => ({
  queueName: process.env.JOBS_QUEUE_NAME,
  concurrency: parseInt(process.env.JOBS_CONCURRENCY ?? '2', 10),
  aiMaxConcurrency: parseInt(process.env.AI_MAX_CONCURRENCY ?? '3', 10),
  aiLatencyMs: parseInt(process.env.AI_LATENCY_MS ?? '400', 10),
}));

export const otelConfig = registerAs('otel', () => ({
  enabled: process.env.OTEL_ENABLED === 'true',
  exporter: process.env.OTEL_EXPORTER,
  serviceName: process.env.OTEL_SERVICE_NAME,
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  logLevel: process.env.LOG_LEVEL,
}));
