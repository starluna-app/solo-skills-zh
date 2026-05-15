"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const configSchema = zod_1.z.object({
    JULES_API_KEY: zod_1.z.string(),
    ANTHROPIC_API_KEY: zod_1.z.string(),
    JULES_API_BASE_URL: zod_1.z.string().default('https://jules.googleapis.com/v1alpha'),
    LOG_LEVEL: zod_1.z.string().default('info'),
    STATE_DIR: zod_1.z.string().default('~/.jules-orchestrator/state'),
    MAX_PARALLEL_SESSIONS: zod_1.z.coerce.number().default(3),
    DEFAULT_REQUIRE_APPROVAL: zod_1.z.coerce.boolean().default(false),
    SESSION_TIMEOUT_MS: zod_1.z.coerce.number().default(14400000),
    RETRY_MAX_ATTEMPTS: zod_1.z.coerce.number().default(1),
});
exports.config = configSchema.parse(process.env);
