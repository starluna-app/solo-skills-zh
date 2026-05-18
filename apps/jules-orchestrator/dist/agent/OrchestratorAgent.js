"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestratorAgent = void 0;
const ExecutionTracker_1 = require("./ExecutionTracker");
class OrchestratorAgent {
    llm;
    skills;
    subagentFactory;
    store;
    logger;
    activeSupervisors = new Map();
    constructor(llm, skills, subagentFactory, store, // TODO: Replace with StateStore interface
    logger // TODO: Replace with Logger interface
    ) {
        this.llm = llm;
        this.skills = skills;
        this.subagentFactory = subagentFactory;
        this.store = store;
        this.logger = logger;
    }
    /**
     * 主入口：处理用户的一个 high-level 请求
     */
    async handleRequest(input) {
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
    async plan(intent) {
        if (this.isObviouslySimple(intent)) {
            return this.createTrivialPlan(intent);
        }
        // 委托给 PlanningSubagent —— 它有独立 context 做深度推理
        const planningSubagent = this.subagentFactory.createPlanningSubagent();
        const result = await planningSubagent.run({ intent });
        if (result.outcome === 'ESCALATE') {
            return this.handlePlanningEscalation(result.escalation, intent);
        }
        return result.data;
    }
    isObviouslySimple(intent) {
        // 启发式：单文件、明确动词、无歧义 (Mock logic for now)
        return false;
    }
    async createTrivialPlan(intent) {
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
    async handlePlanningEscalation(escalation, intent) {
        // TODO: Handle planning escalation (ask user)
        this.logger.warn({ event: 'planning_escalated', reason: escalation.reason });
        throw new Error(`Planning escalated: ${escalation.reason}`);
    }
    /**
     * 执行已批准的 Plan
     */
    async execute(plan) {
        const tracker = new ExecutionTracker_1.ExecutionTracker(plan, this.store);
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
    async dispatchTask(taskId, tracker) {
        const task = tracker.getTask(taskId);
        if (!task)
            throw new Error(`Task ${taskId} not found`);
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
    async handleSupervisorResult(taskId, result, tracker) {
        this.activeSupervisors.delete(taskId);
        switch (result.outcome) {
            case 'COMPLETED':
                tracker.updateSessionState(taskId, 'COMPLETED', { output: result.data });
                break;
            case 'ESCALATE':
                // 主 Agent 来决定: 问用户 / 调整后重试 / 放弃
                await this.handleEscalation(taskId, result.escalation);
                tracker.updateSessionState(taskId, 'FAILED', { error: 'Escalated to User' }); // Mark failed for now
                break;
            case 'FAILED':
                tracker.updateSessionState(taskId, 'FAILED', { error: result.reasoning });
                break;
        }
    }
    async understandIntent(input) {
        this.logger.info({ event: 'understand_intent', input });
        return {
            prompt: input.prompt,
            source: input.repoHint || 'sources/unknown',
            branch: input.branch || 'main',
            constraints: []
        };
    }
    async handleEscalation(taskId, escalation) {
        this.logger.warn({ event: 'supervisor_escalated', taskId, reason: escalation.reason });
        // TODO: interactive logic
    }
    shouldContinue(failures) {
        return false;
    }
}
exports.OrchestratorAgent = OrchestratorAgent;
