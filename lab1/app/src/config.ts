export interface Config {
  port: number;
  dbPath: string;
  tokenTtlHours: number;
  adminPassword: string;
  /** True when ADMIN_PASSWORD was not set and the insecure default is used. */
  adminPasswordIsDefault: boolean;
}

const DEFAULT_ADMIN_PASSWORD = 'admin';

function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** The only place that reads process.env. Scripts pass overrides instead of touching env themselves. */
export function loadConfig(overrides: Partial<Config> = {}): Config {
  const envPassword = process.env.ADMIN_PASSWORD;
  const adminPasswordIsDefault = envPassword === undefined || envPassword === '';
  return {
    port: intFromEnv(process.env.PORT, 3000),
    dbPath: process.env.DB_PATH ?? 'data/lab1.db',
    tokenTtlHours: intFromEnv(process.env.TOKEN_TTL_HOURS, 8),
    adminPassword: adminPasswordIsDefault ? DEFAULT_ADMIN_PASSWORD : envPassword,
    adminPasswordIsDefault,
    ...overrides,
  };
}
