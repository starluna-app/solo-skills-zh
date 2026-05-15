"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningSubagent = exports.PlanningSubagentScope = void 0;
exports.PlanningSubagentScope = {
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
class PlanningSubagent {
    skills;
    llm;
    logger;
    id = 'planning-subagent';
    scope = exports.PlanningSubagentScope;
    currentInput;
    constructor(skills, llm, logger) {
        this.skills = skills;
        this.llm = llm;
        this.logger = logger;
    }
    async run(input) {
        this.currentInput = input;
        this.logger.info({ event: 'planning_start', input });
        try {
            // 1. 探索：生成候选方案
            const candidates = await this.exploreCandidates(input);
            // 2. 评估：打分淘汰
            const evaluated = await this.evaluate(candidates);
            // 3. 决策：选定方案 or 升级
            return this.decide(evaluated, input);
        }
        catch (error) {
            this.logger.error({ event: 'planning_failed', error: error.message });
            return {
                outcome: 'FAILED',
                reasoning: `Planning failed: ${error.message}`,
                toolCalls: []
            };
        }
    }
    async exploreCandidates(input) {
        // 假设通过 skill 初步拆分
        const decompResult = await this.skills.taskDecomposition.analyze(input.intent.prompt);
        return [{ plan: decompResult, score: 0 }];
    }
    async evaluate(candidates) {
        // 调用 dependency-analyzer
        for (const c of candidates) {
            if (c.plan.decomposable && c.plan.subtasks) {
                const deps = await this.skills.dependencyAnalyzer.analyze(c.plan.subtasks);
                c.deps = deps;
                c.score = deps.hasConflicts ? 4 : 8; // 简单启发式
            }
            else {
                c.score = 5;
            }
        }
        return candidates;
    }
    async decide(evaluated, input) {
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
            };
        }
        // 选最高分
        const best = evaluated.sort((a, b) => b.score - a.score)[0];
        let plan;
        if (best.plan.decomposable && best.plan.subtasks) {
            plan = {
                id: `plan_${Date.now()}`,
                originalRequest: { prompt: input.intent.prompt },
                tasks: best.plan.subtasks.map((t) => ({
                    ...t,
                    sourceContext: { source: input.intent.source, githubRepoContext: { startingBranch: input.intent.branch } }
                })),
                parallelGroups: best.deps?.parallelGroups || [best.plan.subtasks.map((t) => t.id)],
                strategy: best.deps?.parallelGroups?.length > 1 ? 'parallel' : 'serial',
                rationale: best.plan.reasoning,
                createdAt: new Date()
            };
        }
        else {
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
exports.PlanningSubagent = PlanningSubagent;
