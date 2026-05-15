export interface SessionMonitor {
  watch(sessionIds: string[]): AsyncIterable<{ sessionId: string, oldState: string, newState: string, session: any }>;
}

export class DefaultSessionMonitor implements SessionMonitor {
  async *watch(sessionIds: string[]) {
    // TODO: Implement polling mechanism
    yield { sessionId: sessionIds[0], oldState: 'QUEUED', newState: 'COMPLETED', session: {} };
  }
}
