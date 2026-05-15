import { ExecutionPlan, SessionRecord, JulesSessionState, Subtask } from '../types/core';

export class ExecutionTracker {
  private sessions: Map<string, SessionRecord> = new Map();

  constructor(public readonly plan: ExecutionPlan, private store: any) {
    // Initialize sessions for all tasks in the plan
    for (const task of plan.tasks) {
      this.sessions.set(task.id, {
        taskId: task.id,
        julesSessionId: '', // Will be populated when dispatched
        state: 'QUEUED',
        attempts: 0,
        startedAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  getTask(taskId: string): Subtask | undefined {
    return this.plan.tasks.find(t => t.id === taskId);
  }

  recordSessionStart(taskId: string, julesSessionId: string): void {
    const record = this.sessions.get(taskId);
    if (record) {
      record.julesSessionId = julesSessionId;
      record.state = 'QUEUED'; // Assuming Jules API starts in QUEUED
      record.attempts += 1;
      record.updatedAt = new Date();
      this.store.saveTrackerState(this.plan.id, Array.from(this.sessions.values()));
    }
  }

  updateSessionState(taskId: string, newState: JulesSessionState, additionalInfo?: any): void {
    const record = this.sessions.get(taskId);
    if (record) {
      record.state = newState;
      record.updatedAt = new Date();
      if (additionalInfo?.output) {
         record.output = additionalInfo.output;
      }
      if (additionalInfo?.error) {
         record.error = additionalInfo.error;
      }
      this.store.saveTrackerState(this.plan.id, Array.from(this.sessions.values()));
    }
  }

  async waitForGroup(groupIds: string[]): Promise<void> {
    // TODO: Implement polling or event-based wait for the given group of tasks
    // For now, this is a placeholder that would integrate with SessionMonitor
  }

  getFailures(groupIds: string[]): SessionRecord[] {
    const failures: SessionRecord[] = [];
    for (const id of groupIds) {
      const record = this.sessions.get(id);
      if (record && record.state === 'FAILED') {
        failures.push(record);
      }
    }
    return failures;
  }
}
