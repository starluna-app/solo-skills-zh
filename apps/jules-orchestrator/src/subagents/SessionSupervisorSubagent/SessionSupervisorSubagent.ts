import { Subtask } from '../../types/core';
import { Subagent, SubagentScope, SubagentResult } from '../common/Subagent';
import { JulesApiClient } from '../../skills/jules-api-client';
import { SessionMonitor } from '../../skills/session-monitor';
import { LLMClient } from '../../llm/LLMClient';
import { Logger } from '../../utils/logger';

export interface SupervisorInput {
  subtask: Subtask;                       // 原始子任务
  julesSessionId: string;                 // 配对的 Jules Session
  constraints: {
    timeoutMs: number;
    maxQuestionsBeforeEscalate: number;   // 防止无限对话
  };
}

export interface SessionOutput {
  taskId: string;
  julesSessionId: string;
  pullRequestUrl?: string;
  pullRequestTitle?: string;
  summary: string;
  filesChanged: string[];
}

export type SupervisorDecision = 
  | { action: 'CONTINUE' }
  | { action: 'COMPLETE' }
  | { action: 'ESCALATE', reason: string, context?: any };

export const SessionSupervisorScope: SubagentScope = {
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

export class SessionSupervisorSubagent implements Subagent<void, SessionOutput> {
  readonly id: string;
  readonly scope = SessionSupervisorScope;
  private questionsAsked = 0;
  
  constructor(
    private input: SupervisorInput,
    private skills: {
      julesClient: JulesApiClient;
      sessionMonitor: SessionMonitor;
    },
    private llm: LLMClient,
    private logger: Logger,
  ) {
    this.id = `supervisor-${input.subtask.id}`;
  }
  
  /** 启动监管循环，直到 Session 完成或需要升级 */
  async run(): Promise<SubagentResult<SessionOutput>> {
    this.logger.info({ event: 'supervisor_started', sessionId: this.input.julesSessionId });
    try {
      for await (const event of this.skills.sessionMonitor.watch([this.input.julesSessionId])) {
        const decision = await this.handleStateChange(event);
        
        if (decision.action === 'ESCALATE') {
          return {
            outcome: 'ESCALATE',
            reasoning: `Decided to escalate: ${decision.reason}`,
            toolCalls: [],
            escalation: {
              reason: decision.reason,
              context: decision.context,
              suggestedActions: []
            }
          };
        }
        if (decision.action === 'COMPLETE') {
          const output = await this.extractOutput();
          return {
            outcome: 'COMPLETED',
            data: output,
            reasoning: 'Session completed successfully',
            toolCalls: []
          };
        }
        // 否则继续监听
      }
      
      return { 
        outcome: 'FAILED', 
        reasoning: 'Monitor ended without completion',
        toolCalls: []
      };
    } catch (error: any) {
        this.logger.error({ event: 'supervisor_error', error: error.message });
        return { 
            outcome: 'FAILED', 
            reasoning: `Supervisor error: ${error.message}`,
            toolCalls: []
        };
    }
  }
  
  private async handleStateChange(event: any): Promise<SupervisorDecision> {
    this.logger.debug({ event: 'state_change', newState: event.newState });
    switch (event.newState) {
      case 'AWAITING_USER_FEEDBACK':
        return this.handleQuestion();
      case 'PAUSED':
        return { action: 'CONTINUE' }; // TODO: implement handlePaused
      case 'COMPLETED':
        return { action: 'COMPLETE' };
      case 'FAILED':
        return { action: 'ESCALATE', reason: 'Session failed' };
      default:
        return { action: 'CONTINUE' };
    }
  }
  
  private async handleQuestion(): Promise<SupervisorDecision> {
    this.questionsAsked++;
    if (this.questionsAsked > this.input.constraints.maxQuestionsBeforeEscalate) {
        return { action: 'ESCALATE', reason: 'Session 多次进入 AWAITING_USER_FEEDBACK 仍无法推进' };
    }

    // Mock implementation for fetching activities and judging
    // const activities = await this.skills.julesClient.listActivities(this.input.julesSessionId);
    const question = "Mock question from Jules";
    
    // Mock LLM judgment
    const judgment = {
        canAnswer: true,
        answer: "Mock answer based on context",
        reasonForEscalation: ""
    };
    
    if (judgment.canAnswer) {
      // await this.skills.julesClient.sendMessage(this.input.julesSessionId, judgment.answer);
      this.logger.info({ event: 'answered_question', answer: judgment.answer });
      return { action: 'CONTINUE' };
    } else {
      return {
        action: 'ESCALATE',
        reason: judgment.reasonForEscalation,
        context: { question, originalTask: this.input.subtask },
      };
    }
  }

  private async extractOutput(): Promise<SessionOutput> {
      const session = await this.skills.julesClient.getSession(this.input.julesSessionId);
      const outputs = session.outputs || {};
      return {
          taskId: this.input.subtask.id,
          julesSessionId: this.input.julesSessionId,
          pullRequestUrl: outputs.pullRequestUrl,
          pullRequestTitle: outputs.pullRequestTitle,
          summary: outputs.summary || 'Session completed successfully',
          filesChanged: outputs.filesChanged || []
      };
  }
}
