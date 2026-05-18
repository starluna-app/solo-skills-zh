import { StateStore } from './StateStore';
import { SessionRecord } from '../types/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileStateStore implements StateStore {
  constructor(private basePath: string) {}

  async savePlan(planId: string, plan: any): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.writeFile(path.join(this.basePath, `${planId}.json`), JSON.stringify(plan, null, 2));
  }

  async saveTrackerState(planId: string, sessions: SessionRecord[]): Promise<void> {
    const sessionsPath = path.join(this.basePath, 'sessions');
    await fs.mkdir(sessionsPath, { recursive: true });
    await fs.writeFile(path.join(sessionsPath, `${planId}.json`), JSON.stringify(sessions, null, 2));
  }
}
