"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultSessionMonitor = void 0;
class DefaultSessionMonitor {
    async *watch(sessionIds) {
        // TODO: Implement polling mechanism
        yield { sessionId: sessionIds[0], oldState: 'QUEUED', newState: 'COMPLETED', session: {} };
    }
}
exports.DefaultSessionMonitor = DefaultSessionMonitor;
