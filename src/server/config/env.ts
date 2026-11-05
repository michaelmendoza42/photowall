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

function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

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
  // Curation is on only when a curator PIN is set.
  PHOTO_WALL_CURATOR_PIN: z.preprocess(
    blankToUndefined,
    z.string().trim().min(4, 'curator PIN must be at least 4 characters').optional(),
  ),
  // Where curation settings and share links live; defaults to
  // `<data root>/curation`. Keep it out of the throwaway cache.
  PHOTO_WALL_CURATION_ROOT: z.preprocess(
    blankToUndefined,
    z.string().trim().min(1).optional(),
  ),
  // Lets the curator hide/restore photos by moving them inside the
  // library. Only takes effect when the library is writable; set false
  // to forbid it even then.
  PHOTO_WALL_LIBRARY_WRITES: BooleanFromEnvSchema.default('true'),
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
  curatorPin: string | null;
  curationRoot: string | null;
  libraryWrites: boolean;
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
    curatorPin: data.PHOTO_WALL_CURATOR_PIN ?? null,
    curationRoot: data.PHOTO_WALL_CURATION_ROOT ?? null,
    libraryWrites: data.PHOTO_WALL_LIBRARY_WRITES,
  };
}
