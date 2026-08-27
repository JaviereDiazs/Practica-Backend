import { plainToInstance, Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

enum OtelExporter {
  Otlp = 'otlp',
  Console = 'console',
}

// process.env values are always strings — class-transformer's implicit
// numeric conversion works out of the box, but booleans need this explicit
// mapping ("false" would otherwise coerce to `true`, since it's a non-empty string).
const toBoolean = ({ value }: TransformFnParams): boolean => value === true || value === 'true';

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  // Database
  @IsString()
  DB_HOST!: string;

  @IsInt()
  DB_PORT!: number;

  @IsString()
  DB_USER!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;

  @Transform(toBoolean)
  @IsBoolean()
  DB_SYNCHRONIZE: boolean = false;

  // Auth
  @IsString()
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN: string = '3600s';

  // Redis / cache
  @IsString()
  REDIS_HOST!: string;

  @IsInt()
  REDIS_PORT!: number;

  @IsInt()
  CACHE_TTL_MS: number = 30000;

  // RabbitMQ
  @IsString()
  RABBITMQ_URL!: string;

  @IsString()
  RABBITMQ_EXCHANGE!: string;

  @IsString()
  RABBITMQ_QUEUE!: string;

  // Jobs
  @IsString()
  JOBS_QUEUE_NAME!: string;

  @IsInt()
  JOBS_CONCURRENCY: number = 2;

  @IsInt()
  AI_MAX_CONCURRENCY: number = 3;

  @IsInt()
  AI_LATENCY_MS: number = 400;

  // Observability
  @Transform(toBoolean)
  @IsBoolean()
  OTEL_ENABLED: boolean = true;

  @IsEnum(OtelExporter)
  OTEL_EXPORTER: OtelExporter = OtelExporter.Otlp;

  @IsString()
  OTEL_SERVICE_NAME: string = 'practica-backend';

  @IsOptional()
  @IsString()
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  @IsString()
  LOG_LEVEL: string = 'debug';
}

/**
 * Passed to ConfigModule.forRoot({ validate }). Runs once at bootstrap — if any
 * variable is missing or has the wrong type, the app throws here instead of
 * failing later with a confusing `undefined` deep in some service.
 */
export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return validated;
}
