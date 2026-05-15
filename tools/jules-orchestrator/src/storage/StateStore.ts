import { SessionRecord } from '../types/core';

export interface StateStore {
  saveTrackerState(planId: string, sessions: SessionRecord[]): Promise<void>;
  // TODO: add methods to save plans, etc.
}
