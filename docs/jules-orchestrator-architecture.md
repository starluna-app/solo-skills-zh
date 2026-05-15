# Jules Orchestrator Agent - 架构设计文档 (v2)

> 一个 AI Agent，理解用户的高层编程需求，将其智能拆分为可并行执行的子任务，并通过 Jules API 分发执行。
>
> **v2 更新：** 引入三层架构（Agent / Subagent / Skill），加入 `PlanningSubagent` 和 `SessionSupervisorSubagent` 设计。

---

## 目录

1. [概述](#1-概述)
2. [三层架构：Agent / Subagent / Skill](#2-三层架构agent--subagent--skill)
3. [Skills 详细设计](#3-skills-详细设计)
4. [Subagents 详细设计](#4-subagents-详细设计)
5. [系统架构](#5-系统架构)
6. [技术规格 (Tech Spec)](#6-技术规格-tech-spec)
7. [核心组件设计](#7-核心组件设计)
8. [数据模型](#8-数据模型)
9. [文件目录结构](#9-文件目录结构)
10. [关键工作流](#10-关键工作流)
11. [错误处理与边界情况](#11-错误处理与边界情况)
12. [配置与部署](#12-配置与部署)
13. [演进路线图](#13-演进路线图)

---

## 1. 概述

### 1.1 项目目标

构建一个 **Jules Orchestrator Agent**，作为用户和 Jules（Google 的 AI Coding Agent）之间的智能中间层。用户用自然语言描述一个较大的工程需求，Orchestrator 负责：

1. **理解** 用户的真实意图和约束
2. **分析** 任务是否可以拆分为独立的并行子任务
3. **规划** 一个最小复杂度的执行策略
4. **分发** 任务到一个或多个 Jules Sessions
5. **追踪** 所有 Session 的状态，整合结果

### 1.2 核心设计原则

- **简单优先 (Simplicity-first)**：能用一个 Session 解决的不拆分。并行只在**真正能减少完成时间**且**子任务确实独立**时启用。
- **依赖感知 (Dependency-aware)**：宁可串行执行也不要错误地并行（导致 PR 冲突、文件竞争）。
- **可观测 (Observable)**：每一个决策、每一次 API 调用都可追溯。
- **优雅降级 (Graceful degradation)**：单个子任务失败不应导致整体崩溃。

### 1.3 非目标 (Non-goals)

- ❌ 替代 Jules 本身的代码生成能力
- ❌ 复杂的工作流编排引擎（如 Airflow、Temporal）
- ❌ 多用户、多租户的 SaaS 平台
- ❌ 实时协作功能

---

## 2. 三层架构：Agent / Subagent / Skill

> 这是文档的**核心概念**部分。理解这三层的边界是理解整个系统的关键。

### 2.1 三层模型概述

```
┌────────────────────────────────────────────────────────────┐
│  Layer 1: Agent  (主 Agent，唯一)                          │
│  • 与用户对话                                              │
│  • 整体编排与最终决策权                                    │
│  • 维护全局任务状态                                        │
└──────────────────┬─────────────────────────────────────────┘
                   │ 委托子领域（带独立 context）
                   ▼
┌────────────────────────────────────────────────────────────┐
│  Layer 2: Subagents  (多个，各管一摊)                      │
│  • 在子领域内有决策权                                      │
│  • 有独立 context window                                   │
│  • 复杂决策但范围受限                                      │
│  • 必须有明确的"升级给主 Agent"的规则                      │
└──────────────────┬─────────────────────────────────────────┘
                   │ 使用工具
                   ▼
┌────────────────────────────────────────────────────────────┐
│  Layer 3: Skills  (多个，纯工具)                           │
│  • 无状态                                                  │
│  • 输入输出确定                                            │
│  • 可被任何 Agent / Subagent 复用                          │
└────────────────────────────────────────────────────────────┘
```

### 2.2 三层对比

| 维度 | Agent | Subagent | Skill |
|------|-------|----------|-------|
| **决策能力** | ✅ 全局决策权 | ✅ 子领域内决策权 | ❌ 无决策 |
| **状态** | 维护整个会话状态 | 维护子领域状态 | 无状态 |
| **上下文窗口** | 主 context | **独立 context** | 共享调用方 context |
| **输入** | 自然语言、模糊目标 | 结构化任务 + 自然语言 | 结构化参数 |
| **输出** | 行动、对话、报告 | 决策结果 + 行动 | 确定性的执行结果 |
| **能调用什么** | Skills + Subagents | Skills（+ 其他 Subagent） | 一般不调用其他 |
| **典型耗时** | 整个会话 | 秒~分钟 | 毫秒~秒 |
| **是否需要 LLM** | 是 | 是 | 通常否（即使有也是封装的实现细节） |
| **复用性** | 单一系统专用 | 子领域专用 | 高度可复用 |

### 2.3 类比帮助理解

| 角色 | 类比 |
|------|------|
| **Agent** | 工头 / 项目经理 — 理解客户需求，调度工人和工具，对最终结果负责 |
| **Subagent** | 专业工人（木匠、电工） — 在自己领域有判断力，能独立处理一个房间的电路 |
| **Skill** | 工具（锤子、螺丝刀） — 没有判断，谁拿起来都能用 |

### 2.4 三层职责划分（一句话总结）

- **Agent 决定**：什么任务？拆不拆？谁去做？  
- **Subagent 决定**：在被分配的子领域内，遇到具体情况怎么办？  
- **Skill 提供**：可被重复调用的、确定性的能力。

### 2.5 何时引入新的 Subagent —— YAGNI 警戒线

⚠️ **Subagent 不是组织代码的方式，是组织"决策"的方式。** 不要因为代码长就拆 Subagent。

**真正需要 Subagent 的信号：**
- ✅ 这个子任务的决策树深度 ≥ 3 层
- ✅ 这个子任务需要自己的对话历史 / 推理痕迹
- ✅ 主 Agent 的 context window 会被这个子任务的细节淹没
- ✅ 这个子任务可能要 LLM 多次往返推理
- ✅ 这个子任务的失败需要自己尝试恢复，再决定是否上报

**伪 Subagent 的迹象（这些应该是 Skill 或普通函数）：**
- ❌ 只是一个 if-else 分支
- ❌ 输入到输出是确定性映射
- ❌ 只是为了"代码组织"
- ❌ "未来可能复杂"（等真的复杂了再拆）

### 2.6 本系统中的具体划分

| 组件 | 类型 | 职责 |
|------|------|------|
| `OrchestratorAgent` | **Agent** | 唯一与用户对话的入口，编排全局 |
| `PlanningSubagent` | **Subagent** | 复杂任务的深度规划专家 |
| `SessionSupervisorSubagent` | **Subagent** | 每个 Jules Session 的"代理人" |
| `FailureRecoverySubagent` | Subagent (未来) | 失败诊断与恢复专家（v3+） |
| `task-decomposition` | Skill | 给出拆分建议（不做最终决定） |
| `dependency-analyzer` | Skill | 分析子任务间的依赖和冲突 |
| `prompt-engineering` | Skill | 把粗糙的描述变成高质量 Jules prompt |
| `jules-api-client` | Skill | 封装 Jules REST API |
| `session-monitor` | Skill | 高效轮询 Session 状态 |

下面两节分别详细介绍 Skills 和 Subagents。

---

## 3. Skills 详细设计

### 3.1 设计原则

每个 Skill 是一个 **单一职责、无状态** 的模块。Agent / Subagent 调用它们来完成具体的事情。

判定为 Skill 的标志：
- 输入是结构化的数据
- 输出可以单元测试
- 不需要"看上下文做判断"
- 可以想象另一个 Agent 也会用到它

### 3.2 Skill 1: `task-decomposition` — 任务拆分技能

**职责：** 给定一个任务描述和仓库上下文，分析它能否被拆分为独立子任务。

**输入：**
```typescript
{
  prompt: string;              // 用户的原始需求
  repoContext?: {              // 可选的仓库信息
    structure: string;         // 文件树
    languages: string[];
    recentFiles: string[];
  };
}
```

**输出：**
```typescript
{
  decomposable: boolean;       // 是否值得拆分
  reasoning: string;           // 决策理由（必须给出，便于审计）
  subtasks?: Array<{           // 如果可以拆分
    id: string;
    prompt: string;            // 给 Jules 的子任务描述
    rationale: string;         // 为什么这是独立的
    estimatedFiles: string[];  // 预计触及的文件（用于冲突检测）
    dependencies: string[];    // 依赖的其他子任务 ID（一般为空）
  }>;
}
```

**这是 Skill 而不是 Agent 的原因：**
- 无状态：同样的输入永远产生同样的分析逻辑
- 不做最终决定："要不要按这个拆分执行"是 Agent / PlanningSubagent 的决定
- 可被复用：未来如果接入非 Jules 的编排器，这个 Skill 仍然适用

### 3.3 Skill 2: `dependency-analyzer` — 依赖分析技能

**职责：** 分析子任务之间的隐含依赖关系，构建依赖图。

**输入：** 子任务列表（来自 `task-decomposition`）

**输出：**
```typescript
{
  graph: DependencyGraph;       // 拓扑图
  parallelGroups: string[][];   // 可并行执行的任务组
  hasConflicts: boolean;        // 是否存在文件冲突
  conflictDetails?: Array<{     // 冲突详情
    files: string[];
    tasks: string[];
  }>;
}
```

**关键启发式规则：**
- 触及相同文件 → 必须串行
- 一个任务的输出是另一个的输入 → 有依赖
- 同一个目录下的修改 → 可能冲突，倾向于串行
- 完全不同模块/目录 → 可并行

### 3.4 Skill 3: `prompt-engineering` — Prompt 工程技能

**职责：** 把高层意图转换为适合 Jules 消费的高质量 prompt。

**提供的能力：**
- 添加上下文信息（语言、框架、约定）
- 注入约束（不修改某些文件、保持向后兼容）
- 拆分长 prompt 为关键点
- 为子任务生成清晰的、与主任务一致的 prompt

### 3.5 Skill 4: `jules-api-client` — Jules API 客户端技能

**职责：** 封装 Jules REST API 的所有底层细节。

**提供的能力：**
- `listSources()` - 列出可用仓库源
- `createSession(params)` - 创建新 Session
- `getSession(id)` - 获取 Session 状态
- `listSessions(filter?)` - 列出所有 Session
- `sendMessage(sessionId, prompt)` - 发送消息到 Session
- `approvePlan(sessionId)` - 批准 Session 的计划
- `listActivities(sessionId)` - 列出 Session 的活动
- `deleteSession(id)` - 删除 Session

### 3.6 Skill 5: `session-monitor` — Session 监控技能

**职责：** 高效地轮询 Jules Sessions 的状态。

**提供的能力：**
- 智能轮询（exponential backoff）
- 状态变化事件流（async iterator / EventEmitter）
- 超时管理
- 批量监控多个 Session

**接口：**
```typescript
const monitor = new SessionMonitor(julesClient);
for await (const event of monitor.watch(sessionIds)) {
  // event: { sessionId, oldState, newState, session }
}
```

---

## 4. Subagents 详细设计

### 4.1 Subagent 通用契约

每个 Subagent 都必须满足以下契约，否则容易蜕变为"披着 Subagent 皮的大函数"：

```typescript
interface Subagent<TInput, TOutput> {
  /** 唯一标识，便于日志追踪 */
  readonly id: string;
  
  /** 该 Subagent 的职责范围声明（防止职责蔓延） */
  readonly scope: SubagentScope;
  
  /** 主要方法：在自己的 scope 内推理并产出结果 */
  run(input: TInput): Promise<SubagentResult<TOutput>>;
}

interface SubagentScope {
  /** 这个 Subagent 能做什么决定 */
  decisions: string[];
  /** 这个 Subagent 必须升级给主 Agent 的情况 */
  escalateOn: string[];
}

interface SubagentResult<T> {
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
```

**关键点：**
- Subagent 必须**显式声明能做什么 / 不能做什么决定**
- Subagent 必须返回**推理痕迹**（reasoning），便于事后审计
- 每个 Subagent 都有清晰的**升级机制**（escalation）

### 4.2 Subagent A: `PlanningSubagent` — 规划专家

#### 4.2.1 角色定位

**这是主 Agent 在规划阶段，遇到复杂任务时委托的"深度思考专家"。**

简单任务（如"修个 typo"），主 Agent 自己处理；复杂任务（如"重构整个支付模块"），委托给 PlanningSubagent 做深度推理。

#### 4.2.2 Scope（职责范围）

```typescript
const PlanningSubagentScope = {
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
```

#### 4.2.3 内部工作流

```
输入: ParsedIntent (主 Agent 已理解过的意图)
    │
    ▼
[1. 探索阶段]
    ├─ 调用 jules-api-client 读取仓库基本信息（README、文件树片段）
    ├─ 调用 task-decomposition 尝试初步拆分
    └─ 形成 N 个候选拆分方案 (candidate plans)
    │
    ▼
[2. 评估阶段]
    ├─ 对每个候选方案调用 dependency-analyzer
    ├─ 评估维度：
    │   • 并行度（能省多少时间）
    │   • 冲突风险（文件 / 目录重叠）
    │   • 协调成本（PR 数量、review 复杂度）
    │   • 单个子任务的清晰度
    └─ 内部打分，淘汰明显劣方案
    │
    ▼
[3. 决策阶段]
    ├─ 如果有清晰的最优方案 → 返回
    ├─ 如果有 2-3 个相当的方案 → 选默认 + 备选返回，让主 Agent 决定是否问用户
    └─ 如果都不理想 → ESCALATE
    │
    ▼
输出: ExecutionPlan + reasoning
```

#### 4.2.4 接口

```typescript
class PlanningSubagent implements Subagent<PlanningInput, ExecutionPlan> {
  readonly id = 'planning-subagent';
  readonly scope = PlanningSubagentScope;
  
  constructor(
    private skills: {
      taskDecomposition: TaskDecompositionSkill;
      dependencyAnalyzer: DependencyAnalyzerSkill;
      julesClient: JulesApiClient;
    },
    private llm: LLMClient,                // 独立的 LLM 会话
    private logger: Logger,
  ) {}
  
  async run(input: PlanningInput): Promise<SubagentResult<ExecutionPlan>> {
    // 1. 探索：生成候选方案
    const candidates = await this.exploreCandidates(input);
    
    // 2. 评估：打分淘汰
    const evaluated = await this.evaluate(candidates);
    
    // 3. 决策：选定方案 or 升级
    return this.decide(evaluated, input);
  }
  
  private async exploreCandidates(input: PlanningInput) { /* ... */ }
  private async evaluate(candidates: Plan[]) { /* ... */ }
  private async decide(evaluated: EvaluatedPlan[], input: PlanningInput) { /* ... */ }
}

interface PlanningInput {
  intent: ParsedIntent;
  constraints?: {
    maxSubtasks?: number;
    preferParallel?: boolean;
  };
  retryCount?: number;  // 主 Agent 让它重新规划时
}
```

#### 4.2.5 何时主 Agent 调用它

```typescript
// 在 OrchestratorAgent.plan() 中
async plan(intent: ParsedIntent): Promise<ExecutionPlan> {
  // 简单情况，主 Agent 直接处理（不必动用 Subagent）
  if (this.isObviouslySimple(intent)) {
    return this.createTrivialPlan(intent);
  }
  
  // 复杂情况，委托给 PlanningSubagent
  const result = await this.planningSubagent.run({ intent });
  
  if (result.outcome === 'ESCALATE') {
    return this.handlePlanningEscalation(result.escalation);
  }
  
  return result.data!;
}

private isObviouslySimple(intent: ParsedIntent): boolean {
  // 启发式：单文件、明确动词、无歧义
  return intent.estimatedScope === 'single-file' 
      && !intent.hasAmbiguity;
}
```

#### 4.2.6 独立 Context 的价值

PlanningSubagent 有自己的 LLM 会话，这意味着：
- 它可以多次往返推理（"我先假设拆 3 块... 不行，那 5 块呢..."）而**不污染主 Agent 的上下文**
- 主 Agent 收到的是**最终结论 + 推理摘要**，不是几千 token 的思考过程
- 在长会话中，主 Agent 的 context 始终保持精炼

---

### 4.3 Subagent B: `SessionSupervisorSubagent` — Session 代理人

#### 4.3.1 角色定位

**每个被分发的 Jules Session 都配一个独立的 Supervisor。**

它是这个 Session 的"代理人"：在它的 Session 内对话、应对 Jules 的反馈、决定何时升级。多个 Session 并行时，多个 Supervisor 并行运行，互不干扰。

这是本系统**最有价值的 Subagent**。

#### 4.3.2 Scope（职责范围）

```typescript
const SessionSupervisorScope = {
  decisions: [
    "回答 Jules 在 AWAITING_USER_FEEDBACK 时提的范围内问题",
    "判断 Jules 的中间提议是否符合原始任务",
    "决定是否给 Jules 发送追加澄清",
    "判断 Session 是否卡住（需要 ping 还是等待）",
    "决定 PAUSED 状态的处置（继续等 / 主动唤醒）",
    "提取最终输出（PR URL、变更摘要）并整理给主 Agent",
  ],
  escalateOn: [
    "Jules 的问题超出原任务范围（如：要不要顺便升级依赖？）",
    "Jules 的中间提议会破坏原任务的约束",
    "Session 多次进入 AWAITING_USER_FEEDBACK 仍无法推进",
    "Session 失败（FAILED 状态）",
    "Session 超过预设超时时间",
    "需要用户做技术决策",
  ],
};
```

#### 4.3.3 架构位置

```
主 Agent 分发任务后:

┌────────────────────────────────────────────────┐
│           OrchestratorAgent (主)                │
│                                                │
│  跟踪: [Supervisor1, Supervisor2, Supervisor3] │
│  接收来自 Supervisors 的 ESCALATE 事件          │
└──┬──────────────┬──────────────┬───────────────┘
   │ 1:1 配对     │ 1:1 配对     │ 1:1 配对
   ▼              ▼              ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│Session  │  │Session  │  │Session  │
│Super-   │  │Super-   │  │Super-   │
│visor 1  │  │visor 2  │  │visor 3  │
│         │  │         │  │         │
│ • 独立  │  │ • 独立  │  │ • 独立  │
│  context│  │  context│  │  context│
│ • 知道  │  │ • 知道  │  │ • 知道  │
│  自己的 │  │  自己的 │  │  自己的 │
│  子任务 │  │  子任务 │  │  子任务 │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     │ 调用       │ 调用       │ 调用
     ▼            ▼            ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Jules   │  │ Jules   │  │ Jules   │
│Session1 │  │Session2 │  │Session3 │
└─────────┘  └─────────┘  └─────────┘
```

#### 4.3.4 内部工作流

```
输入: 一个被分发的 Subtask + 对应的 julesSessionId
    │
    ▼
[初始化]
    └─ Supervisor 记住原始任务上下文（subtask.prompt、约束、文件范围）
    │
    ▼
[监听循环] —— 由 session-monitor 驱动
    │
    ├─→ 收到状态事件
    │     │
    │     ├─ AWAITING_USER_FEEDBACK → 进入 [决策: 回答还是升级]
    │     ├─ IN_PROGRESS → 记录进度，继续监听
    │     ├─ PAUSED → 进入 [决策: 唤醒还是等待]
    │     ├─ COMPLETED → 进入 [提取输出]
    │     └─ FAILED → 升级给主 Agent
    │
    └─→ 直到 COMPLETED 或 ESCALATE
    │
    ▼
[决策: 回答 Jules 的问题]
    ├─ 读取 listActivities 获取 Jules 的问题原文
    ├─ 判断:
    │   ├─ 问题在原始任务上下文中能找到答案 → 调用 sendMessage 自动答
    │   │     例：Jules 问"用 TS 还是 JS？"，仓库是 TS 项目 → 答 TS
    │   ├─ 问题在 scope 内但需要小判断 → Supervisor 自己 LLM 推理后答
    │   │     例：Jules 问"测试放 __tests__/ 还是 *.test.ts 同目录？"
    │   │         → 看仓库现有约定，自己决定
    │   └─ 问题超出 scope → ESCALATE
    │         例：Jules 问"要不要顺便升级 lodash 到最新版？"
    │             → 超出"加测试"的原任务，升级给主 Agent
    │
    ▼
[提取输出]
    ├─ 调用 jules-api-client.getSession 获取最终 outputs
    ├─ 整理 PR URL、变更文件清单、Jules 给出的总结
    └─ 返回 SubagentResult { outcome: COMPLETED, data: SessionOutput }
```

#### 4.3.5 接口

```typescript
class SessionSupervisorSubagent implements Subagent<SupervisorInput, SessionOutput> {
  readonly id: string;  // 形如 "supervisor-{taskId}"
  readonly scope = SessionSupervisorScope;
  
  constructor(
    private input: SupervisorInput,
    private skills: {
      julesClient: JulesApiClient;
      sessionMonitor: SessionMonitor;
    },
    private llm: LLMClient,                // 独立 LLM 会话
    private logger: Logger,
  ) {
    this.id = `supervisor-${input.subtask.id}`;
  }
  
  /** 启动监管循环，直到 Session 完成或需要升级 */
  async run(): Promise<SubagentResult<SessionOutput>> {
    for await (const event of this.skills.sessionMonitor.watch([this.input.julesSessionId])) {
      const decision = await this.handleStateChange(event);
      if (decision.action === 'ESCALATE') {
        return this.escalate(decision);
      }
      if (decision.action === 'COMPLETE') {
        return this.complete(event);
      }
      // 否则继续监听
    }
    // 监控结束但没有完成 → 异常情况
    return { outcome: 'FAILED', reasoning: 'Monitor ended without completion', ... };
  }
  
  private async handleStateChange(event: StateChangeEvent): Promise<SupervisorDecision> {
    switch (event.newState) {
      case 'AWAITING_USER_FEEDBACK':
        return this.handleQuestion();
      case 'PAUSED':
        return this.handlePaused();
      case 'COMPLETED':
        return { action: 'COMPLETE' };
      case 'FAILED':
        return { action: 'ESCALATE', reason: 'Session failed', ... };
      default:
        return { action: 'CONTINUE' };
    }
  }
  
  private async handleQuestion(): Promise<SupervisorDecision> {
    const activities = await this.skills.julesClient.listActivities(this.input.julesSessionId);
    const question = this.extractLatestQuestion(activities);
    
    // 用 LLM 判断这个问题能不能自己答
    const judgment = await this.llm.judge({
      question,
      originalTask: this.input.subtask,
      scope: this.scope,
    });
    
    if (judgment.canAnswer) {
      await this.skills.julesClient.sendMessage(
        this.input.julesSessionId,
        judgment.answer,
      );
      return { action: 'CONTINUE' };
    } else {
      return {
        action: 'ESCALATE',
        reason: judgment.reasonForEscalation,
        context: { question, originalTask: this.input.subtask },
      };
    }
  }
  
  // ... 其他方法
}

interface SupervisorInput {
  subtask: Subtask;                       // 原始子任务
  julesSessionId: string;                 // 配对的 Jules Session
  constraints: {
    timeoutMs: number;
    maxQuestionsBeforeEscalate: number;   // 防止无限对话
  };
}

interface SessionOutput {
  taskId: string;
  julesSessionId: string;
  pullRequestUrl?: string;
  pullRequestTitle?: string;
  summary: string;
  filesChanged: string[];
}
```

#### 4.3.6 与主 Agent 的协作

```typescript
// 主 Agent 分发任务时
private async dispatchTask(taskId: string, tracker: ExecutionTracker) {
  const task = tracker.getTask(taskId);
  
  // 1. 用 Skill 创建 Jules Session
  const refinedPrompt = await this.skills.promptEngineering.refine(task);
  const session = await this.skills.julesClient.createSession({
    prompt: refinedPrompt,
    sourceContext: task.sourceContext,
    automationMode: 'AUTO_CREATE_PR',
    title: task.title,
  });
  
  // 2. 为这个 Session 启动一个 Supervisor Subagent
  const supervisor = new SessionSupervisorSubagent(
    {
      subtask: task,
      julesSessionId: session.id,
      constraints: this.getDefaultConstraints(),
    },
    this.skills,
    this.llm.createSubsession(),  // 独立 LLM 会话
    this.logger.child({ supervisor: task.id }),
  );
  
  // 3. 异步运行 supervisor，主 Agent 继续处理其他任务
  this.activeSupervisors.set(taskId, supervisor);
  supervisor.run().then(result => this.handleSupervisorResult(taskId, result));
  
  tracker.recordSessionStart(taskId, session.id);
}

private async handleSupervisorResult(
  taskId: string,
  result: SubagentResult<SessionOutput>,
) {
  switch (result.outcome) {
    case 'COMPLETED':
      this.tracker.recordSuccess(taskId, result.data!);
      break;
    case 'ESCALATE':
      // 主 Agent 来决定: 问用户 / 调整后重试 / 放弃
      await this.handleEscalation(taskId, result.escalation!);
      break;
    case 'FAILED':
      this.tracker.recordFailure(taskId, result.reasoning);
      break;
  }
}
```

#### 4.3.7 独立 Context 的价值（最关键的设计点）

**没有 Supervisor 时**：
```
主 Agent 的 context 包含：
  • 用户原始对话
  • 3 个 Session 的所有状态变化
  • 3 个 Session 中 Jules 问的所有问题
  • 3 个 Session 中所有 activities 的细节
→ 几千 token，且互相干扰
```

**有 Supervisor 时**：
```
主 Agent 的 context 包含：
  • 用户原始对话
  • 3 个 Supervisor 的"摘要状态"（运行中 / 完成 / 升级）
  • 升级事件的精简描述

每个 Supervisor 的 context 包含：
  • 自己负责的子任务详情
  • 自己 Session 的 activities
  • 自己的推理痕迹
→ 各自精炼，互不干扰
```

这让系统能可靠地并行处理多个 Session，且主 Agent 始终保持"清醒"。

---

### 4.4 未来 Subagent: `FailureRecoverySubagent`（v3+，本期不实现）

简要说明，便于未来扩展时回顾设计意图：

**职责：** 当 Session 失败时，深度分析失败原因，决定恢复策略。

**为什么以后才做：**
- v1/v2 阶段，失败处理用简单策略表（在主 Agent 内 if-else）即可
- 等积累了足够多的真实失败案例，识别出常见失败模式后，再抽象为 Subagent
- 过早引入 = 过度设计

**未来的预期接口：**
```typescript
interface FailureRecoveryInput {
  sessionId: string;
  failureActivities: Activity[];
  originalTask: Subtask;
  retryHistory: RetryRecord[];
}

interface FailureRecoveryOutput {
  action: 'RETRY_AS_IS' | 'RETRY_WITH_REFINED_PROMPT' 
        | 'SPLIT_FURTHER' | 'ESCALATE_TO_USER' | 'ABANDON';
  rationale: string;
  refinedPrompt?: string;       // 如果 action 是 RETRY_WITH_REFINED_PROMPT
  newSubtasks?: Subtask[];      // 如果 action 是 SPLIT_FURTHER
}
```

引入时机：当主 Agent 中的失败处理逻辑超过 ~200 行，或失败处理逻辑开始有"探索-假设-验证"循环时。

---

## 5. 系统架构

### 5.1 高层架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User Interface                               │
│                  (CLI / Web UI / Slack Bot)                           │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  OrchestratorAgent (主 Agent / Layer 1)               │
│                                                                       │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│   │   Intent   │  │  Planner   │  │ Dispatcher │  │  Reporter  │    │
│   │ Understand │→ │            │→ │            │→ │            │    │
│   └────────────┘  └─────┬──────┘  └─────┬──────┘  └────────────┘    │
│                         │ delegate      │ spawn 1:1 per task         │
└─────────────────────────┼───────────────┼─────────────────────────────┘
                          ▼               ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                 Subagent Layer (Layer 2)                          │
   │                                                                   │
   │   ┌────────────────────────┐    ┌────────────────────────┐       │
   │   │  PlanningSubagent      │    │ SessionSupervisor      │       │
   │   │  (深度规划专家)        │    │ Subagent × N           │       │
   │   │  • 独立 LLM context    │    │ (每个 Session 一个)    │       │
   │   │  • 探索→评估→决策      │    │  • 独立 LLM context    │       │
   │   │                        │    │  • 应对 Jules 反馈     │       │
   │   │                        │    │  • 升级超范围决策      │       │
   │   └───────────┬────────────┘    └───────────┬────────────┘       │
   │               │ uses                         │ uses               │
   └───────────────┼─────────────────────────────┼─────────────────────┘
                   ▼                             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    Skill Layer (Layer 3)                          │
   │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐  │
   │  │ task-      │ │ dependency-│ │ prompt-    │ │ session-    │  │
   │  │ decomp.    │ │ analyzer   │ │ engineering│ │ monitor     │  │
   │  └────────────┘ └────────────┘ └────────────┘ └─────────────┘  │
   │  ┌──────────────────────────────────────────────────────────┐   │
   │  │                  jules-api-client                        │   │
   │  └──────────────────────────────────────────────────────────┘   │
   └────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    Jules REST API                                 │
   │            (https://jules.googleapis.com/v1alpha)                 │
   └────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
                ┌───────────────────────────────┐
                │   GitHub Repos (Jules works   │
                │   on user's repositories)     │
                └───────────────────────────────┘
```

**关键交互：**
- **主 Agent → PlanningSubagent**：1:1，只在复杂任务时延迟创建，规划完即释放
- **主 Agent → SessionSupervisorSubagent**：1:N，每个分发出去的子任务对应一个 Supervisor，并行运行
- **Subagents → Skills**：多对多，Subagents 自由使用 Skills
- **主 Agent → Skills**：直接使用（简单任务时不必走 Subagent）

### 5.2 数据流

```
User Input
   │
   ▼
[Intent Understanding] —— 主 Agent
   ├─ Parse natural language
   ├─ Extract: repo, branch, constraints, urgency
   └─ State: gather missing info if needed
   │
   ▼
[Planning Decision] —— 主 Agent 决定
   │
   ├─ 简单任务 ──────────────────────────────┐
   │                                          │
   └─ 复杂任务 → 委托 PlanningSubagent       │
        │                                     │
        │  [PlanningSubagent 内部循环]        │
        │   ├─ Explore: 生成候选方案          │
        │   ├─ Evaluate: 调用 dep-analyzer    │
        │   ├─ Decide: 选定 or ESCALATE       │
        │   └─ 返回 ExecutionPlan             │
        │                                     │
        ▼                                     ▼
[Dispatch] —— 主 Agent
   ├─ For each task (respecting deps):
   │    ├─ Call prompt-engineering to refine
   │    ├─ Call jules-api-client.createSession()
   │    ├─ Spawn SessionSupervisorSubagent (1:1)
   │    └─ Supervisor 异步开始监管循环
   │
   ▼
[Parallel Supervision] —— 多个 Supervisor 并行
   │
   │  对每个 SessionSupervisorSubagent:
   │   ├─ 接收 session-monitor 的状态事件
   │   ├─ AWAITING_USER_FEEDBACK 时:
   │   │    ├─ 在 scope 内 → 自动 sendMessage
   │   │    └─ 超出 scope → ESCALATE 给主 Agent
   │   ├─ FAILED → ESCALATE
   │   └─ COMPLETED → 提取 PR URL，返回结果
   │
   ▼
[Escalation Handling] —— 主 Agent
   ├─ 收到 Supervisor 的 ESCALATE 事件
   ├─ 决策：问用户 / 重试 / 调整 plan / 放弃
   └─ 必要时与用户多轮对话
   │
   ▼
[Report] —— 主 Agent
   └─ Aggregate all supervisors' outputs → user
```

---

## 6. 技术规格 (Tech Spec)

### 6.1 技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| **语言** | TypeScript (Node.js 20+) | 类型安全；Jules API 是 REST，TS 生态成熟；如未来需要 macOS 桌面客户端可与 Swift 通过 HTTP/IPC 集成 |
| **运行时** | Node.js 20 LTS | 原生 fetch、稳定 |
| **HTTP 客户端** | 原生 `fetch` + 轻量重试封装 | 避免引入大依赖 |
| **CLI 框架** | `commander` | 简单稳定 |
| **配置** | `.env` + `zod` 验证 | 类型安全配置 |
| **日志** | `pino` | 结构化、高性能 |
| **测试** | `vitest` | 快、TS 原生 |
| **AI 模型** | LLM Provider Agnostic (支持 OpenAI, Anthropic, Gemini, 以及本地模型如 Ollama / LMStudio) | 高质量推理；必须支持标准 API 接入，不能与单一厂商强绑定 |
| **存储** | 本地 JSON 文件（v1）→ SQLite（v2） | v1 阶段保持简单 |

### 6.2 不引入的技术（以及理由）

- ❌ **工作流引擎 (Temporal, Airflow)**：当前规模不需要。手写状态机更可控。
- ❌ **消息队列 (RabbitMQ, Redis)**：v1 单进程足够。
- ❌ **数据库 ORM**：v1 直接 JSON 文件。
- ❌ **微服务架构**：单一二进制部署。

> 当前规模下增加这些会**违反"简单优先"原则**。

### 6.3 关键性能指标 (KPI)

| 指标 | 目标值 |
|------|--------|
| 拆分决策延迟 | < 5s |
| 创建 Session 延迟 | < 2s（受 Jules API 限制） |
| 监控轮询开销 | < 1% CPU |
| 单 Orchestrator 进程并发 Session | 最多 10 个 |
| 任务失败自动重试次数 | 默认 1 次 |

### 6.4 限制与约束

- Jules API 是 **alpha** 阶段，可能变更
- Jules 用户每次最多 3 个 API keys
- 不可控因素：Jules Session 本身的执行时长（可能数分钟到数小时）
- 每个 Jules Session 是独立的 Git 分支，**多个并行 Session 不能修改同一文件**

---

## 7. 核心组件设计

### 7.1 `OrchestratorAgent` 类

```typescript
// src/agent/OrchestratorAgent.ts

class OrchestratorAgent {
  /** 当前活跃的 Session Supervisors，taskId → Supervisor */
  private activeSupervisors = new Map<string, SessionSupervisorSubagent>();
  
  constructor(
    private llm: LLMClient,                    // 用于决策的 LLM
    private skills: {
      taskDecomposition: TaskDecompositionSkill;
      dependencyAnalyzer: DependencyAnalyzerSkill;
      promptEngineering: PromptEngineeringSkill;
      julesClient: JulesApiClient;
      sessionMonitor: SessionMonitor;
    },
    private subagentFactory: SubagentFactory,  // 创建 Subagent 的工厂
    private store: StateStore,
    private logger: Logger,
  ) {}

  /**
   * 主入口：处理用户的一个 high-level 请求
   */
  async handleRequest(input: UserRequest): Promise<RequestOutcome> {
    // 1. 理解意图
    const intent = await this.understandIntent(input);

    // 2. 如果缺信息，询问用户
    if (intent.missingInfo) {
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
      await this.waitForSupervisors(group, tracker);

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
  private async dispatchTask(taskId: string, tracker: ExecutionTracker) {
    const task = tracker.getTask(taskId);
    
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
      constraints: this.getDefaultConstraints(),
    });
    this.activeSupervisors.set(taskId, supervisor);

    // 4. 异步启动 supervisor，主 Agent 立刻返回去分发下一个任务
    supervisor.run().then(result => this.handleSupervisorResult(taskId, result));
  }

  /**
   * 处理 Supervisor 完成（成功 / 升级 / 失败）
   */
  private async handleSupervisorResult(
    taskId: string,
    result: SubagentResult<SessionOutput>,
  ) {
    this.activeSupervisors.delete(taskId);
    
    switch (result.outcome) {
      case 'COMPLETED':
        this.tracker.recordSuccess(taskId, result.data!);
        break;
      case 'ESCALATE':
        // 主 Agent 来决定: 问用户 / 调整后重试 / 放弃
        await this.handleEscalation(taskId, result.escalation!);
        break;
      case 'FAILED':
        this.tracker.recordFailure(taskId, result.reasoning);
        break;
    }
  }

  // ... 更多方法（understandIntent, handleEscalation, etc.）
}
```

**关键观察：** 主 Agent 不再直接监听 Session 状态、不再处理 Jules 的中间问题——这些都被委托给了各自的 Supervisor。主 Agent 只在 Supervisor **升级** 时介入。这是三层架构的核心收益。

### 7.2 状态机：Session 生命周期处理

每个被分发的 Jules Session 由 Orchestrator 跟踪状态：

```
       Created
          │
          ▼
       QUEUED ──→ PLANNING ──→ IN_PROGRESS ──→ COMPLETED ✓
                      │             │              │
                      ▼             ▼              ▼
              AWAITING_PLAN   AWAITING_USER     output: PR URL
              _APPROVAL       _FEEDBACK
                  │                 │
                  │                 ▼
                  │           [Agent decides:
                  │            answer or ask user]
                  │
                  └──→ [Auto-approved by Agent]
                  
                       FAILED ✗
                          │
                          ▼
                   [Agent decides:
                    retry / skip / abort]
```

每个状态变化由 `session-monitor` Skill 上报，由 Agent 决定处置。

### 7.3 决策点：三层分别"做什么决定"

明确列出每一层需要做的关键决策，便于审计和测试：

#### 主 Agent 的决策

| 决策点 | 输入 | 输出 | 备注 |
|--------|------|------|------|
| D1 | 用户原始请求 | 是否值得动用 PlanningSubagent？ | 简单任务自己处理 |
| D2 | PlanningSubagent 的输出 | 接受 / 让它重新规划 / 问用户 | 主 Agent 是最终拍板者 |
| D3 | Supervisor 的 ESCALATE 事件 | 问用户 / 调整 plan 重试 / 放弃 | 这是主 Agent 最常被唤醒的场景 |
| D4 | 部分子任务失败 | 继续其他 / 整体中止 | 基于失败比例、依赖关系 |
| D5 | 用户中途修改需求 | 修改现有 Session or 重新规划 | 可能需要终止已派出的 Supervisors |
| D6 | 全部完成 | 何时、如何向用户报告 | 实时 / 批量 |

#### PlanningSubagent 的决策

| 决策点 | 输入 | 输出 | 备注 |
|--------|------|------|------|
| P1 | 候选拆分方案 | 选哪个 / 都不好需要 ESCALATE | 在 N 个候选中选 |
| P2 | 一个拆分方案 | 并行 vs 串行 vs 混合 | 基于 dep-analyzer 输出 |
| P3 | 评估循环 | 是否继续探索新方案 | 防止无限循环 |
| P4 | 需求模糊点 | 自己假设 or ESCALATE 问用户 | 优先自己假设 + 在 plan 里标注 |

#### SessionSupervisorSubagent 的决策（每个 Supervisor 独立做）

| 决策点 | 输入 | 输出 | 备注 |
|--------|------|------|------|
| S1 | Jules 问的具体问题 | 自己答 / ESCALATE | 看是否在原任务 scope 内 |
| S2 | Jules 的中间提议 | 批准 / 否决 / ESCALATE | 看是否违反原约束 |
| S3 | Session 进入 PAUSED | 等 / 主动 ping | 一般等，超时再 ping |
| S4 | 已和 Jules 来回 N 次 | 继续 / ESCALATE | 防止陷入对话 |
| S5 | Session 超时 | ESCALATE | 不擅自终止 |

**所有决策都必须记录 reasoning**，便于事后审计 Agent / Subagent 的决策质量。

---

## 8. 数据模型

### 8.1 核心类型

```typescript
// src/types/core.ts

/**
 * 用户的原始请求
 */
interface UserRequest {
  prompt: string;
  repoHint?: string;          // 可选：用户指明的仓库
  branch?: string;
  requireApproval?: boolean;  // 是否需要用户批准 plan
  parallelismHint?: 'prefer' | 'avoid' | 'auto';  // 默认 auto
}

/**
 * Agent 对意图的理解
 */
interface ParsedIntent {
  prompt: string;
  source: string;             // sources/github/...
  branch: string;
  constraints: string[];      // ["保持向后兼容", "不要改动 db schema"]
  missingInfo?: boolean;
  questions?: string[];
}

/**
 * 一个子任务
 */
interface Subtask {
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
interface ExecutionPlan {
  id: string;
  originalRequest: UserRequest;
  tasks: Subtask[];
  parallelGroups: string[][]; // 拓扑排序后的并行组
  strategy: 'single' | 'serial' | 'parallel' | 'mixed';
  rationale: string;          // 为什么用这个策略
  createdAt: Date;
}

/**
 * 一个被分发的 Session 的运行时记录
 */
interface SessionRecord {
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
 * Jules 的 Session 状态（来自 API）
 */
type JulesSessionState =
  | 'QUEUED'
  | 'PLANNING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'AWAITING_USER_FEEDBACK'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED';

/**
 * Source Context（与 Jules API 对齐）
 */
interface SourceContext {
  source: string;             // "sources/github/owner/repo"
  githubRepoContext: {
    startingBranch: string;
  };
}

/**
 * 请求处理结果
 */
type RequestOutcome =
  | { type: 'NEED_INPUT'; questions: string[] }
  | { type: 'PLAN_READY'; plan: ExecutionPlan; awaitApproval: true }
  | { type: 'SUCCESS'; tracker: ExecutionTracker }
  | { type: 'PARTIAL_FAILURE'; tracker: ExecutionTracker }
  | { type: 'ABORTED'; reason: string };
```

### 8.2 持久化模型 (v1: JSON 文件)

```
~/.jules-orchestrator/
├── config.json          # 用户配置（API key 引用、默认值）
├── state/
│   ├── plans/
│   │   └── {plan_id}.json
│   └── sessions/
│       └── {session_id}.json
└── logs/
    └── {date}.log
```

---

## 9. 文件目录结构

```
jules-orchestrator/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── src/
│   ├── index.ts                          # CLI 入口
│   │
│   ├── agent/                            # ★ Layer 1: Agent 层
│   │   ├── OrchestratorAgent.ts          # 主 Agent 类
│   │   ├── IntentUnderstanding.ts        # 意图理解模块
│   │   ├── Planner.ts                    # 规划入口（决定是否调用 PlanningSubagent）
│   │   ├── Dispatcher.ts                 # 分发模块（派 Supervisor）
│   │   ├── EscalationHandler.ts          # 处理 Subagent 升级
│   │   ├── ExecutionTracker.ts           # 执行状态追踪
│   │   └── prompts/                      # 主 Agent 使用的 prompt
│   │       ├── understand-intent.md
│   │       └── handle-escalation.md
│   │
│   ├── subagents/                        # ★ Layer 2: Subagent 层
│   │   ├── common/
│   │   │   ├── Subagent.ts               # Subagent 接口定义
│   │   │   ├── SubagentScope.ts          # Scope 类型定义
│   │   │   ├── SubagentResult.ts         # 标准返回类型
│   │   │   └── SubagentFactory.ts        # 创建 Subagent 的工厂
│   │   │
│   │   ├── PlanningSubagent/
│   │   │   ├── index.ts                  # 公开接口
│   │   │   ├── PlanningSubagent.ts       # 主类
│   │   │   ├── explorePhase.ts           # 探索阶段逻辑
│   │   │   ├── evaluatePhase.ts          # 评估阶段逻辑
│   │   │   ├── decidePhase.ts            # 决策阶段逻辑
│   │   │   ├── scope.ts                  # PlanningSubagentScope 定义
│   │   │   ├── prompts/
│   │   │   │   ├── exploration.md
│   │   │   │   ├── evaluation.md
│   │   │   │   └── decision.md
│   │   │   └── PlanningSubagent.test.ts
│   │   │
│   │   └── SessionSupervisorSubagent/
│   │       ├── index.ts
│   │       ├── SessionSupervisorSubagent.ts   # 主类
│   │       ├── stateHandlers/                  # 各状态的处理逻辑
│   │       │   ├── handleAwaitingFeedback.ts
│   │       │   ├── handlePaused.ts
│   │       │   ├── handleCompleted.ts
│   │       │   └── handleFailed.ts
│   │       ├── scopeJudge.ts                   # 判断问题是否在 scope 内
│   │       ├── scope.ts                        # SessionSupervisorScope 定义
│   │       ├── prompts/
│   │       │   ├── supervisor-system.md
│   │       │   ├── judge-question.md
│   │       │   └── extract-output.md
│   │       └── SessionSupervisorSubagent.test.ts
│   │
│   │   # 未来 (v3+):
│   │   # └── FailureRecoverySubagent/
│   │   #     └── ...
│   │
│   ├── skills/                           # ★ Layer 3: Skill 层
│   │   ├── task-decomposition/
│   │   │   ├── index.ts                  # 公开接口
│   │   │   ├── decompose.ts              # 核心逻辑
│   │   │   ├── heuristics.ts             # 拆分启发式规则
│   │   │   └── decompose.test.ts
│   │   │
│   │   ├── dependency-analyzer/
│   │   │   ├── index.ts
│   │   │   ├── analyze.ts
│   │   │   ├── graph.ts                  # 依赖图实现
│   │   │   └── analyze.test.ts
│   │   │
│   │   ├── prompt-engineering/
│   │   │   ├── index.ts
│   │   │   ├── refine.ts
│   │   │   ├── templates.ts
│   │   │   └── refine.test.ts
│   │   │
│   │   ├── jules-api-client/
│   │   │   ├── index.ts
│   │   │   ├── client.ts                 # 主客户端
│   │   │   ├── endpoints/
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── activities.ts
│   │   │   │   └── sources.ts
│   │   │   ├── errors.ts                 # API 错误类
│   │   │   ├── retry.ts                  # 重试逻辑
│   │   │   └── client.test.ts
│   │   │
│   │   └── session-monitor/
│   │       ├── index.ts
│   │       ├── monitor.ts                # 轮询引擎
│   │       ├── backoff.ts                # 指数退避
│   │       └── monitor.test.ts
│   │
│   ├── types/                            # 共享类型定义
│   │   ├── core.ts
│   │   ├── jules-api.ts                  # Jules API 响应类型
│   │   ├── subagent.ts                   # Subagent 相关类型
│   │   └── index.ts
│   │
│   ├── storage/                          # 持久化
│   │   ├── StateStore.ts                 # 接口
│   │   ├── FileStateStore.ts             # v1 文件实现
│   │   └── StateStore.test.ts
│   │
│   ├── llm/                              # LLM 抽象
│   │   ├── LLMClient.ts                  # 接口
│   │   ├── AnthropicClient.ts            # Claude 实现
│   │   └── LLMSession.ts                 # 独立会话支持（Subagent 用）
│   │
│   ├── config/
│   │   ├── Config.ts                     # 配置加载与验证
│   │   └── schema.ts                     # zod schema
│   │
│   ├── cli/                              # CLI 命令
│   │   ├── commands/
│   │   │   ├── run.ts                    # 主命令：处理一个请求
│   │   │   ├── status.ts                 # 查看状态（含 Supervisors 状态）
│   │   │   ├── list.ts                   # 列出 plans / sessions
│   │   │   └── cancel.ts
│   │   └── ui/
│   │       ├── render.ts                 # 终端 UI
│   │       └── prompts.ts                # 交互式输入
│   │
│   └── utils/
│       ├── logger.ts
│       ├── id.ts                         # ID 生成
│       └── async.ts                      # Promise 工具
│
├── tests/
│   ├── integration/
│   │   ├── end-to-end.test.ts
│   │   ├── subagent-coordination.test.ts # 主 Agent ↔ Subagents 协作
│   │   └── mocks/
│   │       └── mockJulesApi.ts
│   └── fixtures/
│       └── sample-requests.json
│
└── docs/
    ├── architecture.md                   # 本文档
    ├── three-layer-model.md              # 三层模型详解
    ├── decisions/                        # ADR (Architecture Decision Records)
    │   ├── 001-no-workflow-engine.md
    │   ├── 002-typescript-over-go.md
    │   ├── 003-file-store-v1.md
    │   ├── 004-introduce-subagents.md    # 为什么引入 Subagent 层
    │   └── 005-supervisor-per-session.md # 为什么 1:1 派 Supervisor
    └── examples/
        ├── simple-task.md
        └── parallel-task.md
```

### 9.1 目录结构的设计原则

1. **三层物理隔离**：`agent/`、`subagents/`、`skills/` 三个目录严格分开 ← **这是核心架构边界**
2. **每个 Subagent 是一个独立目录**，包含自己的子模块、prompts、测试
3. **`subagents/common/` 放共享契约**：Subagent 接口、Scope 类型、Factory
4. **每个 Skill 是一个独立目录**，内部高内聚（实现 + 测试）
5. **`types/` 共享**，避免循环依赖
6. **`llm/` 是可替换的抽象**，且支持创建独立 LLM 会话（给 Subagent 用）
7. **`storage/` 是接口 + 实现**，便于 v2 升级到 SQLite
8. **ADR (Architecture Decision Records)** 记录关键的设计决策（如"为什么引入 Subagent"），将来回顾时有据可查

---

## 10. 关键工作流

### 10.1 工作流 A：简单任务（不动用 Subagent）

```
用户："修复 README 里的拼写错误"
   ↓
[主 Agent] understandIntent()
   → 意图清晰，只涉及 1 个文件
   → 判断: isObviouslySimple = true，不需要 PlanningSubagent
   ↓
[主 Agent] createTrivialPlan()
   → 直接调用 task-decomposition skill 确认是单任务
   → 生成简单 ExecutionPlan
   ↓
[主 Agent] dispatchTask()
   → 调用 prompt-engineering skill 优化 prompt
   → 调用 jules-api-client.createSession()
   → 派 1 个 SessionSupervisorSubagent
   ↓
[Supervisor] 监管循环
   → session-monitor 上报 IN_PROGRESS → COMPLETED
   → 提取 PR URL
   → 返回 { outcome: COMPLETED, data: { pullRequestUrl: ... } }
   ↓
[主 Agent] report()
   → "已修复，PR: https://github.com/.../pull/42"
```

### 10.2 工作流 B：复杂任务 + 并行子任务（动用两类 Subagent）

```
用户："给我的项目添加 dark mode 支持，包括 UI 组件、用户偏好存储和文档更新"
   ↓
[主 Agent] understandIntent()
   → 涉及多个领域，需要深度规划
   → 判断: isObviouslySimple = false
   ↓
[主 Agent] 委托 PlanningSubagent.run()
   │
   │   [PlanningSubagent] 独立 context 内：
   │     ├─ Explore: 生成 3 个候选拆分方案
   │     │    • 方案 A: 按层拆 (UI / 状态 / 文档)
   │     │    • 方案 B: 按文件拆
   │     │    • 方案 C: 不拆，一次性做
   │     ├─ Evaluate: 调用 dependency-analyzer 对每个方案打分
   │     │    • A: 并行度高，无冲突 → 8/10
   │     │    • B: 冲突风险高 → 4/10
   │     │    • C: 单任务巨大，Jules 易失败 → 5/10
   │     └─ Decide: 选方案 A
   │     返回: { outcome: COMPLETED, data: ExecutionPlan(3 tasks, parallel) }
   ↓
[主 Agent] execute(plan)
   ├─ 并行 dispatchTask × 3:
   │    ├─ Task 1 (UI): 创建 Session 1 + 派 Supervisor 1
   │    ├─ Task 2 (状态): 创建 Session 2 + 派 Supervisor 2
   │    └─ Task 3 (文档): 创建 Session 3 + 派 Supervisor 3
   │
   │   [Supervisor 1, 2, 3 并行运行]
   │     │
   │     ├─ Supervisor 1: Jules 问"用 CSS 变量还是 styled-components？"
   │     │    → 查仓库现状，发现用 styled-components
   │     │    → 自己答 sendMessage("用 styled-components")
   │     │
   │     ├─ Supervisor 2: Jules 问"要不要顺便加多语言切换？"
   │     │    → 判断超出原任务 scope
   │     │    → ESCALATE 给主 Agent
   │     │
   │     └─ Supervisor 3: 顺利完成
   │
   ↓
[主 Agent] 处理 Supervisor 2 的 ESCALATE
   → 决定问用户："Jules 问要不要加多语言切换，原任务没要求，怎么办？"
   → 用户："不加，按原任务做"
   → 主 Agent 让 Supervisor 2 替它回复 Jules
   ↓
[Supervisor 2] 继续监管直到 COMPLETED
   ↓
[主 Agent] 等所有 Supervisors 完成
   → report(): "3 个 PR 已创建: [link1, link2, link3]"
```

### 10.3 工作流 C：有依赖的任务（必须串行）

```
用户："重构用户模型 schema，并更新所有使用它的接口"
   ↓
[主 Agent] 委托 PlanningSubagent
   → PlanningSubagent: 拆 2 个任务，dep-analyzer 检测出依赖
   → 返回 ExecutionPlan: parallelGroups = [[task1], [task2]]
   ↓
[主 Agent] execute()
   ├─ Group 1: dispatchTask(task1: schema) + Supervisor 1
   │   → 等待 Supervisor 1 完成
   ├─ Group 2: dispatchTask(task2: interfaces, 基于 task1 的分支) + Supervisor 2
   │   → 等待 Supervisor 2 完成
   ↓
[主 Agent] report()
```

### 10.4 工作流 D：失败处理（v1 简单策略，主 Agent 直接处理）

```
[Supervisor X] Session 进入 FAILED
   → 自动 ESCALATE 给主 Agent
   ↓
[主 Agent] handleEscalation(FAILED)
   ├─ 读取 Supervisor 提供的 context（含失败 activities）
   ├─ 基于简单策略表判断:
   │   ├─ 临时错误 (rate limit, timeout) → 重新 dispatch (派新 Supervisor)
   │   ├─ Plan 不合理 → 调整 prompt 后重新 dispatch
   │   └─ 仓库结构问题 → 终止，问用户
   └─ 决策记入日志

注：v3+ 引入 FailureRecoverySubagent 后，这里改为：
   [主 Agent] 委托 FailureRecoverySubagent 深度诊断
              → 返回更精细的恢复策略
```

### 10.5 工作流 E：Jules 问问题（由 Supervisor 直接处理）

```
[Jules Session X] 进入 AWAITING_USER_FEEDBACK
   ↓
[Supervisor X] 收到 session-monitor 事件
   ├─ 调用 jules-api-client.listActivities 获取 Jules 的问题
   ├─ 用自己的 LLM 判断 (scopeJudge):
   │   ├─ 答案能从原任务上下文推断 → 自动 sendMessage
   │   │   例: Jules 问"测试用 Jest 还是 Vitest？" → 仓库已有 vitest.config.ts → 答 Vitest
   │   ├─ 在 scope 内但需要小判断 → Supervisor 用 LLM 推理后答
   │   │   例: Jules 问"测试文件放哪？" → 看现有约定 → 答 "__tests__/"
   │   └─ 超出 scope → ESCALATE 给主 Agent
   │       例: Jules 问"要不要重构整个模块？" → 超出任务范围 → 升级
   ↓
[主 Agent]（仅在升级时介入）
   ├─ 评估升级理由
   ├─ 决定问用户 or 自己拍板
   └─ 让 Supervisor 替它回复 Jules
```

**注意工作流 E 的关键改进：** 在旧设计中，每个 Session 的每个问题都要主 Agent 介入。在新设计中，**绝大多数问题由 Supervisor 自己处理**，主 Agent 只在真正需要决策时被唤醒。这让多 Session 并行成为可能。

---

## 11. 错误处理与边界情况

### 11.1 错误分类

| 类别 | 例子 | 处理策略 |
|------|------|----------|
| **配置错误** | API key 无效、未授权仓库 | 启动时检查，立即失败 |
| **API 临时错误** | 429 rate limit、5xx | 指数退避重试 |
| **API 永久错误** | 400 bad request、404 | 不重试，记录详情上报用户 |
| **Session 失败** | Jules 自身无法完成 | 见 8.4 |
| **依赖未满足** | 串行执行中前置失败 | 跳过依赖它的任务，报告 |
| **超时** | Session 卡在 IN_PROGRESS > 4h | 询问用户是否中止 |
| **冲突** | 并行 Session 修改同文件 | 启动前由 dependency-analyzer 防止 |

### 11.2 关键不变量 (Invariants)

1. **每个 Subtask 至多对应 1 个活跃 Jules Session**（重试时旧的必须先标记失败）
2. **并行组内的 Subtask 不可触及相同文件**（Agent 必须在分发前验证）
3. **所有持久化状态变更必须是原子的**（避免半写状态）
4. **API 密钥永不写入日志**

### 11.3 安全考量

- API key 通过环境变量加载，不进 git
- 用户 prompt 不会被记录到非本地日志
- 与 LLM 交互时不传递 API key
- 日志中的 PR URL 等可分享，但需配置脱敏选项

---

## 12. 配置与部署

### 12.1 环境变量

```bash
# .env.example

# 必需 (API keys)
JULES_API_KEY=your_jules_api_key_here

# LLM 供应商配置 (支持多个，按需配置一个即可)
# 选项 1: OpenAI 兼容接口 (推荐，可用于 LMStudio, Ollama, OpenAI)
LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=your_openai_or_local_key_here
LLM_MODEL=gpt-4o-mini # 或你的本地模型名

# 选项 2: Anthropic
# ANTHROPIC_API_KEY=your_anthropic_key_here
# LLM_MODEL=claude-3-5-sonnet-20241022

# 可选

JULES_API_BASE_URL=https://jules.googleapis.com/v1alpha
LOG_LEVEL=info                              # debug | info | warn | error
STATE_DIR=~/.jules-orchestrator/state
MAX_PARALLEL_SESSIONS=3                     # 同时运行的 Session 上限
DEFAULT_REQUIRE_APPROVAL=false              # 是否默认让用户批准 plan
SESSION_TIMEOUT_MS=14400000                 # 4 小时
RETRY_MAX_ATTEMPTS=1
```

### 12.2 CLI 使用示例

```bash
# 安装
npm install -g jules-orchestrator

# 配置（首次）
jules-orch init

# 基本使用
jules-orch run "Add dark mode to my dashboard app"

# 带选项
jules-orch run "Refactor auth module" \
  --repo myorg/myrepo \
  --branch develop \
  --require-approval \
  --parallelism prefer

# 查看进行中的任务
jules-orch status

# 查看历史
jules-orch list --last 10

# 取消
jules-orch cancel <plan-id>
```

### 12.3 部署模式

**v1 模式：本地独立 CLI**
- 单进程，自带 LLM 推理引擎（支持本地/云端大模型）
- 状态持久化到 `~/.jules-orchestrator/`
- 进程退出时持久化未完成的 plan，下次启动可恢复

**v2 模式（未来）：宿主智能体扩展包 (Host Agent Extension Mode)**
- **这是最终的大规模分发形态**
- 剥离自身的 LLM 推理能力，将 Orchestrator 降级为**纯工作流执行器 (Workflow Controller)**。
- 遇到决策点（如任务拆分、Jules 提问）时，Orchestrator 不调用大模型，而是通过终端标准输入输出（stdin/stdout）将决策权上报给当前的“宿主大脑”（如 Gemini CLI, Claude Code, Cursor 等）。
- 这种模式下，用户只需配置 `JULES_API_KEY`，无需重复配置大模型 Key，避免了“套娃”调用的费用和冗余。

**v3 模式（未来）：daemon + CLI**
- daemon 持续运行，监控所有 Session
- CLI 通过 IPC 与 daemon 通信
- 适合长运行任务（数小时）

**v4 模式（未来）：服务化**
- 部署为 web service
- 支持团队共享 plans
- 需要数据库（PostgreSQL/SQLite）

### 12.4 监控与可观测性

每次决策、每次 API 调用都记录结构化日志：

```json
{
  "timestamp": "2026-05-14T10:30:00Z",
  "level": "info",
  "component": "agent.planner",
  "event": "decision",
  "decision": "split_into_3_parallel",
  "rationale": "Tasks touch separate directories (utils/, components/, docs/)",
  "planId": "plan_abc123",
  "requestId": "req_xyz789"
}
```

便于事后审计 Agent 的决策质量。

---

## 13. 演进路线图

> 三层架构不必一次性全部实现。本节给出推荐的演进顺序，遵循 YAGNI 原则。

### v1：单层 Agent + Skills（MVP）

**目标：** 验证 Jules API 集成、基本的拆分-分发-监控流程跑通。

**包含：**
- ✅ `OrchestratorAgent`（直接处理状态变化，不使用 Subagent）
- ✅ 全部 5 个 Skills
- ❌ 没有 Subagent 层
- 失败处理用简单 if-else

**适用场景：** Demo 阶段、概念验证、单用户单任务。

### v2：引入 SessionSupervisorSubagent

**触发条件：** 当主 Agent 中处理 Session 状态变化的逻辑超过 ~300 行，或同时管理 3+ Session 时主 Agent 的 context 明显被淹没。

**新增：**
- ✅ `subagents/common/` 公共契约
- ✅ `SessionSupervisorSubagent`
- ✅ `SubagentFactory`
- ✅ 主 Agent 改造为通过 Supervisor 分发任务
- ✅ Escalation 处理逻辑

**收益：**
- 主 Agent context 明显精简
- 多 Session 并行更可靠
- 每个 Session 的对话独立追溯

**这是 ROI 最高的一步。**

### v3：引入 PlanningSubagent

**触发条件：** 当主 Agent 的规划逻辑（含与 task-decomposition、dependency-analyzer 的多轮调用）超过 ~200 行，或开始遇到需要"探索多个方案再决定"的复杂任务时。

**新增：**
- ✅ `PlanningSubagent`
- ✅ 主 Agent 的 `plan()` 改造：简单任务自处理，复杂任务委托

**收益：**
- 应对真正复杂的工程任务
- 规划质量可独立优化和测试

### v4：引入 FailureRecoverySubagent（可选）

**触发条件：** 当失败处理逻辑超过 ~200 行，或失败处理开始有"探索-假设-验证"循环时。

**新增：**
- ✅ `FailureRecoverySubagent`
- ✅ 主 Agent 的失败处理改为委托

### 不要急于推进版本

每一步引入前，先问：**"现在的代码真的够复杂了吗？"** 如果答案是"还行，再观察一下"，那就再观察一下。

---

## 附录 A：三层判定 Checklist

当你不确定一段代码该放在哪一层时，按以下顺序问：

### 第一步：是 Skill 吗？

**判定为 Skill 的迹象：**
- ✅ 输入是结构化的数据
- ✅ 输出可以单元测试
- ✅ 不需要"看上下文做判断"
- ✅ 可以想象另一个 Agent 也会用到它
- ✅ 不需要 LLM（或 LLM 调用是封装在 Skill 内部的实现细节）

**所有迹象都符合？→ 是 Skill。** 放进 `skills/`，结束。

### 第二步：不是 Skill，那是 Subagent 吗？

**判定为 Subagent 的迹象：**
- ✅ 这个子任务的决策树深度 ≥ 3 层
- ✅ 需要自己的对话历史 / 推理痕迹
- ✅ 在自己的子领域内能独立做决定
- ✅ 主 Agent 的 context 会被它的细节淹没
- ✅ 可能要 LLM 多次往返推理
- ✅ 失败可以自己尝试恢复，再决定是否上报
- ✅ 能清晰列出"什么决策能自己做，什么必须上报"

**所有迹象都符合？→ 是 Subagent。** 放进 `subagents/`，定义清晰的 Scope 和 Escalation 规则。

**只符合一半？→ 可能还不需要拆。** 先在主 Agent 里写普通函数，等到真的复杂了再升级。

### 第三步：以上都不是，那就是主 Agent 自己的事

放进 `agent/`，作为主 Agent 的内部方法。

### 反模式警报 ⚠️

**这些不是 Subagent，只是普通函数/类：**
- ❌ "Logger Subagent"（这是工具）
- ❌ "ConfigLoader Subagent"（这是数据加载）
- ❌ "Validator Subagent"（这是 Skill）
- ❌ 为了"代码组织"创建的 Subagent
- ❌ 没有决策逻辑，纯做 if-else 路由的 Subagent

**真正的 Subagent 必须能回答：** "如果遇到 X 情况你怎么办？" 答案不能是固定的查表，而要包含推理。

---

## 附录 B：Subagent 与多 Agent 系统的区别

避免概念混淆：

| Subagent | 多 Agent 系统 |
|---------|--------------|
| 单一主 Agent 委托给 Subagent | 多个对等的 Agent 协商 |
| 有清晰的层级关系 | 通常对等（peer-to-peer） |
| Subagent 不直接与用户对话 | 多个 Agent 都可能直接对话 |
| 共享同一目标 | 可能有各自目标 |
| 一个项目 / 一个进程 | 可能跨服务、跨组织 |

本项目是**前者**：单一主 Agent + 多个领域专用的 Subagent。我们**不构建** AutoGen / CrewAI 风格的多 Agent 协商系统——那对当前问题是过度设计。

---

## 附录 C：未来扩展点

1. **多 Coding Agent 支持**：抽象出 `CodingAgent` 接口，未来可加入 Cursor、Devin 等（届时 `SessionSupervisorSubagent` 需要泛化）
2. **学习与优化**：记录 Subagent 的历史决策成功率，逐步优化 scope 边界和 escalation 阈值
3. **可视化 UI**：Web 仪表盘查看主 Agent 的状态、各 Supervisor 的进度、ESCALATE 队列
4. **团队协作**：多用户共享 plan 和 Supervisor 状态
5. **集成 IDE**：VS Code 扩展直接发起请求
6. **Supervisor 间通信**：当前 Supervisors 互不通信（这是设计选择，保持简单）；未来若需要"task 2 看到 task 1 的中间产出"，再设计协调机制

---

*Document version: 2.0*  
*Last updated: 2026-05-14*  
*Change log:*  
*- v2.0: 引入 Subagent 层（PlanningSubagent + SessionSupervisorSubagent），从两层架构升级为三层架构*  
*- v1.0: 初始架构（Agent + Skills 两层）*
