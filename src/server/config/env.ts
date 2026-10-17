import { z } from 'zod';

const LogLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
]);

const BooleanFromEnvSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, ctx) => {
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'expected boolean-like value (true/false, 1/0, yes/no, on/off)',
    });
    return z.NEVER;
  });

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PHOTO_WALL_LIBRARY_ROOT: z.string().min(1).default('/photos'),
  PHOTO_WALL_DATA_ROOT: z.string().min(1).default('/data'),
  PHOTO_WALL_BIND_HOST: z.string().min(1).default('0.0.0.0'),
  PHOTO_WALL_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PHOTO_WALL_LOG_LEVEL: LogLevelSchema.default('info'),
  PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY: BooleanFromEnvSchema.default('false'),
  PHOTO_WALL_PREWARM_DERIVATIVES: BooleanFromEnvSchema.default('true'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  libraryRoot: string;
  dataRoot: string;
  bindHost: string;
  port: number;
  logLevel: z.infer<typeof LogLevelSchema>;
  scanTopLevelYearsOnly: boolean;
  prewarmDerivatives: boolean;
};

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new ConfigValidationError(issues);
  }
  const data = parsed.data;
  return {
    nodeEnv: data.NODE_ENV,
    libraryRoot: data.PHOTO_WALL_LIBRARY_ROOT,
    dataRoot: data.PHOTO_WALL_DATA_ROOT,
    bindHost: data.PHOTO_WALL_BIND_HOST,
    port: data.PHOTO_WALL_PORT,
    logLevel: data.PHOTO_WALL_LOG_LEVEL,
    scanTopLevelYearsOnly: data.PHOTO_WALL_SCAN_TOP_LEVEL_YEARS_ONLY,
    prewarmDerivatives: data.PHOTO_WALL_PREWARM_DERIVATIVES,
  };
}
