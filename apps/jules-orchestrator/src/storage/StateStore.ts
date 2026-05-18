import { SessionRecord } from '../types/core';

export interface StateStore {
  saveTrackerState(planId: string, sessions: SessionRecord[]): Promise<void>;
  savePlan(planId: string, plan: any): Promise<void>;
}
