import { ExecutionPlan, ParsedIntent, Subtask } from '../../types/core';
import { Subagent, SubagentResult, SubagentScope } from '../common/Subagent';
import { TaskDecompositionSkill } from '../../skills/task-decomposition';
import { DependencyAnalyzerSkill } from '../../skills/dependency-analyzer';
import { JulesApiClient } from '../../skills/jules-api-client';
import { LLMClient } from '../../llm/LLMClient';
import { Logger } from '../../utils/logger';

export interface PlanningInput {
  intent: ParsedIntent;
  constraints?: {
    maxSubtasks?: number;
    preferParallel?: boolean;
  };
  retryCount?: number;  // 主 Agent 让它重新规划时
}

export const PlanningSubagentScope: SubagentScope = {
  decisions: [
    "选择拆分粒度（粗 vs 细）",
    "在多个可行的拆分方案中选择最优",
    "判断拆分的成本/收益是否划算",
    "决定执行策略（serial / parallel / mixed）",
    "对模糊的需求点提出澄清问题（返给主 Agent 转达用户）",
  ],
  escalateOn: [
    "需要用户决策的关键技术选型",
    "需求本身存在矛盾",
    "目标仓库结构未知且无法推断",
    "尝试 N 次后仍无法收敛到合理 plan",
  ],
};

export class PlanningSubagent implements Subagent<PlanningInput, ExecutionPlan> {
  readonly id = 'planning-subagent';
  readonly scope = PlanningSubagentScope;
  private currentInput?: PlanningInput;
  
  constructor(
    private skills: {
      taskDecomposition: TaskDecompositionSkill;
      dependencyAnalyzer: DependencyAnalyzerSkill;
      julesClient: JulesApiClient;
    },
    private llm: LLMClient,
    private logger: Logger,
  ) {}
  
  async run(input: PlanningInput): Promise<SubagentResult<ExecutionPlan>> {
    this.currentInput = input;
    this.logger.info({ event: 'planning_start', input });

    try {
      // 1. 探索：生成候选方案
      const candidates = await this.exploreCandidates(input);
      
      // 2. 评估：打分淘汰
      const evaluated = await this.evaluate(candidates);
      
      // 3. 决策：选定方案 or 升级
      return this.decide(evaluated, input);
    } catch (error: any) {
      this.logger.error({ event: 'planning_failed', error: error.message });
      return {
        outcome: 'FAILED',
        reasoning: `Planning failed: ${error.message}`,
        toolCalls: []
      };
    }
  }
  
  private async exploreCandidates(input: PlanningInput): Promise<any[]> {
    // 假设通过 skill 初步拆分
    const decompResult = await this.skills.taskDecomposition.analyze(input.intent.prompt);
    return [{ plan: decompResult, score: 0 }];
  }

  private async evaluate(candidates: any[]): Promise<any[]> {
    // 调用 dependency-analyzer
    for (const c of candidates) {
        if (c.plan.decomposable && c.plan.subtasks) {
            const deps = await this.skills.dependencyAnalyzer.analyze(c.plan.subtasks);
            c.deps = deps;
            c.score = deps.hasConflicts ? 4 : 8; // 简单启发式
        } else {
            c.score = 5;
        }
    }
    return candidates;
  }

  private async decide(evaluated: any[], input: PlanningInput): Promise<SubagentResult<ExecutionPlan>> {
    if (evaluated.length === 0) {
        return {
            outcome: 'ESCALATE',
            reasoning: 'No viable candidates found.',
            toolCalls: [],
            escalation: {
                reason: '尝试 N 次后仍无法收敛到合理 plan',
                context: {},
                suggestedActions: ['ask_user_for_clarification']
            }
        }
    }
    
    // 选最高分
    const best = evaluated.sort((a, b) => b.score - a.score)[0];
    
    let plan: ExecutionPlan;
    if (best.plan.decomposable && best.plan.subtasks) {
        plan = {
            id: `plan_${Date.now()}`,
            originalRequest: { prompt: input.intent.prompt },
            tasks: best.plan.subtasks.map((t: any) => ({
                ...t,
                sourceContext: { source: input.intent.source, githubRepoContext: { startingBranch: input.intent.branch } }
            })),
            parallelGroups: best.deps?.parallelGroups || [best.plan.subtasks.map((t:any) => t.id)],
            strategy: best.deps?.parallelGroups?.length > 1 ? 'parallel' : 'serial',
            rationale: best.plan.reasoning,
            createdAt: new Date()
        };
    } else {
         plan = {
            id: `plan_${Date.now()}`,
            originalRequest: { prompt: input.intent.prompt },
            tasks: [{
                id: 'task_1',
                title: 'Main Task',
                prompt: input.intent.prompt,
                rationale: 'Not decomposable',
                estimatedFiles: [],
                dependencies: [],
                sourceContext: { source: input.intent.source, githubRepoContext: { startingBranch: input.intent.branch } }
            }],
            parallelGroups: [['task_1']],
            strategy: 'single',
            rationale: 'Single task fallback',
            createdAt: new Date()
        };
    }

    return {
      outcome: 'COMPLETED',
      data: plan,
      reasoning: `Selected best plan with score ${best.score}`,
      toolCalls: []
    };
  }
}
