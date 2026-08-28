import { plainToInstance, Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsString, Max, Min, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

// process.env values are always strings — class-transformer's implicit
// numeric conversion works out of the box (given an explicit `: number`
// type annotation — this scaffold's compiler needs it, unlike plain tsc),
// but booleans need this explicit mapping: "false" is a non-empty string,
// so it would otherwise coerce to `true`.
const toBoolean = ({ value }: TransformFnParams): boolean => value === true || value === 'true';

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

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
