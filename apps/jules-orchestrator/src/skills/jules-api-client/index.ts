import { JulesSession, JulesSessionCreateParams } from '../../types/jules-api';

export interface JulesApiClient {
  createSession(params: JulesSessionCreateParams): Promise<JulesSession>;
  getSession(sessionId: string): Promise<JulesSession>;
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
}
