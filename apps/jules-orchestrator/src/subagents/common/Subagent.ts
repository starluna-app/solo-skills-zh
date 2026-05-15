export interface Subagent<TInput, TOutput> {
  /** 唯一标识，便于日志追踪 */
  readonly id: string;
  
  /** 该 Subagent 的职责范围声明（防止职责蔓延） */
  readonly scope: SubagentScope;
  
  /** 主要方法：在自己的 scope 内推理并产出结果 */
  run(input?: TInput): Promise<SubagentResult<TOutput>>;
}

export interface SubagentScope {
  /** 这个 Subagent 能做什么决定 */
  decisions: string[];
  /** 这个 Subagent 必须升级给主 Agent 的情况 */
  escalateOn: string[];
}

export interface ToolCallRecord {
  skill: string;
  method: string;
  args: any;
  result: any;
}

export interface SubagentResult<T> {
  outcome: 'COMPLETED' | 'ESCALATE' | 'FAILED';
  data?: T;
  escalation?: {                // outcome === ESCALATE 时
    reason: string;
    context: unknown;
    suggestedActions: string[];
  };
  reasoning: string;            // 决策过程，必须记录
  toolCalls: ToolCallRecord[];  // 用了哪些 Skills，便于审计
}
