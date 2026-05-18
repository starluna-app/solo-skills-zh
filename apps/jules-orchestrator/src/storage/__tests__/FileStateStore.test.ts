import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileStateStore } from '../FileStateStore';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs/promises completely
vi.mock('fs/promises');

describe('FileStateStore', () => {
  const basePath = '/mock/base/path';
  let store: FileStateStore;

  beforeEach(() => {
    store = new FileStateStore(basePath);
    vi.clearAllMocks();
  });

  describe('savePlan', () => {
    it('should create the base directory and save the plan', async () => {
      const planId = 'plan-123';
      const plan = { id: planId, some: 'data' };

      await store.savePlan(planId, plan);

      expect(fs.mkdir).toHaveBeenCalledWith(basePath, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, `${planId}.json`),
        JSON.stringify(plan, null, 2)
      );
    });

    it('should throw if mkdir fails', async () => {
      const error = new Error('mkdir failed');
      vi.mocked(fs.mkdir).mockRejectedValueOnce(error);

      await expect(store.savePlan('plan-123', {})).rejects.toThrow('mkdir failed');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should throw if writeFile fails', async () => {
      const error = new Error('writeFile failed');
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockRejectedValueOnce(error);

      await expect(store.savePlan('plan-123', {})).rejects.toThrow('writeFile failed');
    });
  });

  describe('saveTrackerState', () => {
    it('should create the sessions directory and save sessions', async () => {
      const planId = 'plan-123';
      const sessions = [
        {
          taskId: 'task-1',
          julesSessionId: 'jules-1',
          state: 'QUEUED' as any,
          attempts: 0,
          startedAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      await store.saveTrackerState(planId, sessions);

      const sessionsPath = path.join(basePath, 'sessions');
      expect(fs.mkdir).toHaveBeenCalledWith(sessionsPath, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(sessionsPath, `${planId}.json`),
        JSON.stringify(sessions, null, 2)
      );
    });

    it('should throw if mkdir fails', async () => {
      const error = new Error('mkdir failed');
      vi.mocked(fs.mkdir).mockRejectedValueOnce(error);

      await expect(store.saveTrackerState('plan-123', [])).rejects.toThrow('mkdir failed');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should throw if writeFile fails', async () => {
      const error = new Error('writeFile failed');
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockRejectedValueOnce(error);

      await expect(store.saveTrackerState('plan-123', [])).rejects.toThrow('writeFile failed');
    });
  });
});
