/**
 * 用户的原始请求
 */
export interface UserRequest {
  prompt: string;
  repoHint?: string;          // 可选：用户指明的仓库
  branch?: string;
  requireApproval?: boolean;  // 是否需要用户批准 plan
  parallelismHint?: 'prefer' | 'avoid' | 'auto';  // 默认 auto
}

/**
 * Agent 对意图的理解
 */
export interface ParsedIntent {
  prompt: string;
  source: string;             // sources/github/...
  branch: string;
  constraints: string[];      // ["保持向后兼容", "不要改动 db schema"]
  missingInfo?: boolean;
  questions?: string[];
}

/**
 * Source Context（与 Jules API 对齐）
 */
export interface SourceContext {
  source: string;             // "sources/github/owner/repo"
  githubRepoContext: {
    startingBranch: string;
  };
}

/**
 * 一个子任务
 */
export interface Subtask {
  id: string;                 // 内部 ID
  title: string;
  prompt: string;
  rationale: string;
  estimatedFiles: string[];
  dependencies: string[];     // 其他 Subtask 的 ID
  sourceContext: SourceContext;
}

/**
 * 执行计划（Agent 的核心产物）
 */
export interface ExecutionPlan {
  id: string;
  originalRequest: UserRequest;
  tasks: Subtask[];
  parallelGroups: string[][]; // 拓扑排序后的并行组
  strategy: 'single' | 'serial' | 'parallel' | 'mixed';
  rationale: string;          // 为什么用这个策略
  createdAt: Date;
}

/**
 * Jules 的 Session 状态（来自 API）
 */
export type JulesSessionState =
  | 'QUEUED'
  | 'PLANNING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'AWAITING_USER_FEEDBACK'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED';

/**
 * 一个被分发的 Session 的运行时记录
 */
export interface SessionRecord {
  taskId: string;             // 关联到 Subtask
  julesSessionId: string;
  state: JulesSessionState;
  attempts: number;
  output?: {
    pullRequestUrl?: string;
    pullRequestTitle?: string;
  };
  error?: string;
  startedAt: Date;
  updatedAt: Date;
}

/**
 * 请求处理结果
 */
export type RequestOutcome =
  | { type: 'NEED_INPUT'; questions: string[] }
  | { type: 'PLAN_READY'; plan: ExecutionPlan; awaitApproval: true }
  | { type: 'SUCCESS'; tracker: any } // Note: replace 'any' with ExecutionTracker when imported
  | { type: 'PARTIAL_FAILURE'; tracker: any }
  | { type: 'ABORTED'; reason: string };
