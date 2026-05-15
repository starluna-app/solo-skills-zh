import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  JULES_API_KEY: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  JULES_API_BASE_URL: z.string().default('https://jules.googleapis.com/v1alpha'),
  LOG_LEVEL: z.string().default('info'),
  STATE_DIR: z.string().default('~/.jules-orchestrator/state'),
  MAX_PARALLEL_SESSIONS: z.coerce.number().default(3),
  DEFAULT_REQUIRE_APPROVAL: z.coerce.boolean().default(false),
  SESSION_TIMEOUT_MS: z.coerce.number().default(14400000),
  RETRY_MAX_ATTEMPTS: z.coerce.number().default(1),
});

export const config = configSchema.parse(process.env);
