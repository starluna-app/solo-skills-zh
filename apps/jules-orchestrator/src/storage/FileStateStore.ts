import { StateStore } from './StateStore';
import { SessionRecord } from '../types/core';

export class FileStateStore implements StateStore {
  async saveTrackerState(planId: string, sessions: SessionRecord[]): Promise<void> {
    // TODO: Write to ~/.jules-orchestrator/state/sessions/...
  }
}
