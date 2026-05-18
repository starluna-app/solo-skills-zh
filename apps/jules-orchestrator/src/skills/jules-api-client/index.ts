import { JulesSession, JulesSessionCreateParams, JulesActivity } from '../../types/jules-api';

export interface JulesApiClient {
  createSession(params: JulesSessionCreateParams): Promise<JulesSession>;
  getSession(sessionId: string): Promise<JulesSession>;
  listActivities(sessionId: string): Promise<JulesActivity[]>;
  sendMessage(sessionId: string, message: string): Promise<void>;
  // TODO: Add other methods
}

export class DefaultJulesApiClient implements JulesApiClient {
  async createSession(params: JulesSessionCreateParams): Promise<JulesSession> {
    // TODO: Actual API call
    return { id: 'mock-session-123', state: 'QUEUED' };
  }
  async getSession(sessionId: string): Promise<JulesSession> {
    // TODO: Actual API call
    return { id: sessionId, state: 'COMPLETED' };
  }
  async listActivities(sessionId: string): Promise<JulesActivity[]> {
    // TODO: Actual API call
    return [];
  }
  async sendMessage(sessionId: string, message: string): Promise<void> {
    // TODO: Actual API call
  }
}
