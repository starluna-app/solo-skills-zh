import { ExecutionPlan, ParsedIntent, RequestOutcome, Subtask, UserRequest } from '../types/core';
import { ExecutionTracker } from './ExecutionTracker';
import { SubagentFactory } from '../subagents/common/SubagentFactory';
import { SessionSupervisorSubagent, SessionOutput } from '../subagents/SessionSupervisorSubagent/SessionSupervisorSubagent';
import { SubagentResult } from '../subagents/common/Subagent';
import { LLMClient } from '../llm/LLMClient';

export class OrchestratorAgent {
  private activeSupervisors = new Map<string, SessionSupervisorSubagent>();

  constructor(
    private llm: LLMClient,
    private skills: {
      taskDecomposition: any;
      dependencyAnalyzer: any;
      promptEngineering: any;
      julesClient: any;
      sessionMonitor: any;
    },
    private subagentFactory: SubagentFactory,
    private store: any, // TODO: Replace with StateStore interface
    private logger: any // TODO: Replace with Logger interface
  ) {}

  /**
   * 主入口：处理用户的一个 high-level 请求
   */
  async handleRequest(input: UserRequest): Promise<RequestOutcome> {
    // 1. 理解意图
    const intent = await this.understandIntent(input);

    // 2. 如果缺信息，询问用户
    if (intent.missingInfo && intent.questions) {
      return { type: 'NEED_INPUT', questions: intent.questions };
    }

    // 3. 规划执行
    const plan = await this.plan(intent);

    // 4. 在执行前给用户看（可选）
    if (input.requireApproval) {
      return { type: 'PLAN_READY', plan, awaitApproval: true };
    }

    // 5. 执行
    return this.execute(plan);
  }

  /**
   * 规划：简单任务自己处理，复杂任务委托 PlanningSubagent
   */
  private async plan(intent: ParsedIntent): Promise<ExecutionPlan> {
    if (this.isObviouslySimple(intent)) {
      return this.createTrivialPlan(intent);
    }
    
    // 委托给 PlanningSubagent —— 它有独立 context 做深度推理
    const planningSubagent = this.subagentFactory.createPlanningSubagent();
    const result = await planningSubagent.run({ intent });
    
    if (result.outcome === 'ESCALATE') {
      return this.handlePlanningEscalation(result.escalation!, intent);
    }
    return result.data!;
  }

  private isObviouslySimple(intent: ParsedIntent): boolean {
    // 启发式：单文件、明确动词、无歧义 (Mock logic for now)
    return false;
  }

  private async createTrivialPlan(intent: ParsedIntent): Promise<ExecutionPlan> {
      return {
          id: `plan_${Date.now()}`,
          originalRequest: { prompt: intent.prompt },
          tasks: [{
              id: 'task_1',
              title: 'Trivial Task',
              prompt: intent.prompt,
              rationale: 'Obviously simple',
              estimatedFiles: [],
              dependencies: [],
              sourceContext: { source: intent.source, githubRepoContext: { startingBranch: intent.branch } }
          }],
          parallelGroups: [['task_1']],
          strategy: 'single',
          rationale: 'Trivial',
          createdAt: new Date()
      };
  }

  private async handlePlanningEscalation(escalation: any, intent: ParsedIntent): Promise<ExecutionPlan> {
      // TODO: Handle planning escalation (ask user)
      this.logger.warn({ event: 'planning_escalated', reason: escalation.reason });
      throw new Error(`Planning escalated: ${escalation.reason}`);
  }

  /**
   * 执行已批准的 Plan
   */
  async execute(plan: ExecutionPlan): Promise<RequestOutcome> {
    const tracker = new ExecutionTracker(plan, this.store);

    // 按拓扑顺序执行
    for (const group of plan.parallelGroups) {
      // 同组并行：每个任务派一个 Supervisor 监管
      await Promise.all(group.map(taskId => this.dispatchTask(taskId, tracker)));

      // 等待这一组所有 Supervisors 完成
      await tracker.waitForGroup(group);

      // 检查失败处理策略
      const failures = tracker.getFailures(group);
      if (failures.length > 0 && !this.shouldContinue(failures)) {
        return { type: 'PARTIAL_FAILURE', tracker };
      }
    }

    return { type: 'SUCCESS', tracker };
  }

  /**
   * 分发单个任务：创建 Jules Session + 派一个 Supervisor 监管
   */
  private async dispatchTask(taskId: string, tracker: ExecutionTracker): Promise<void> {
    const task = tracker.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    
    // 1. 用 Skill 优化 prompt
    const refinedPrompt = await this.skills.promptEngineering.refine(task);
    
    // 2. 用 Skill 创建 Jules Session
    const session = await this.skills.julesClient.createSession({
      prompt: refinedPrompt,
      sourceContext: task.sourceContext,
      requirePlanApproval: false,
      automationMode: 'AUTO_CREATE_PR',
      title: task.title,
    });
    tracker.recordSessionStart(taskId, session.id);

    // 3. 为这个 Session 派一个 Supervisor —— 独立 context，并行运行
    const supervisor = this.subagentFactory.createSessionSupervisor({
      subtask: task,
      julesSessionId: session.id,
      constraints: { timeoutMs: 14400000, maxQuestionsBeforeEscalate: 3 },
    });
    this.activeSupervisors.set(taskId, supervisor);

    // 4. 异步启动 supervisor，主 Agent 立刻返回去分发下一个任务
    supervisor.run().then(result => this.handleSupervisorResult(taskId, result, tracker));
  }

  /**
   * 处理 Supervisor 完成（成功 / 升级 / 失败）
   */
  private async handleSupervisorResult(
    taskId: string,
    result: SubagentResult<SessionOutput>,
    tracker: ExecutionTracker
  ) {
    this.activeSupervisors.delete(taskId);
    
    switch (result.outcome) {
      case 'COMPLETED':
        tracker.updateSessionState(taskId, 'COMPLETED', { output: result.data });
        break;
      case 'ESCALATE':
        // 主 Agent 来决定: 问用户 / 调整后重试 / 放弃
        await this.handleEscalation(taskId, result.escalation!);
        tracker.updateSessionState(taskId, 'FAILED', { error: 'Escalated to User' }); // Mark failed for now
        break;
      case 'FAILED':
        tracker.updateSessionState(taskId, 'FAILED', { error: result.reasoning });
        break;
    }
  }

  private async understandIntent(input: UserRequest): Promise<ParsedIntent> {
    this.logger.info({ event: 'understand_intent', input });
    return {
      prompt: input.prompt,
      source: input.repoHint || 'sources/unknown',
      branch: input.branch || 'main',
      constraints: []
    };
  }

  private async handleEscalation(taskId: string, escalation: any) {
      this.logger.warn({ event: 'supervisor_escalated', taskId, reason: escalation.reason });
      // TODO: interactive logic
  }

  private shouldContinue(failures: any[]): boolean {
    return false;
  }
}
