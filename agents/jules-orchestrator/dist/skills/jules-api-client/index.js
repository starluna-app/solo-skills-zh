"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultJulesApiClient = void 0;
class DefaultJulesApiClient {
    async createSession(params) {
        // TODO: Actual API call
        return { id: 'mock-session-123', state: 'QUEUED' };
    }
}
exports.DefaultJulesApiClient = DefaultJulesApiClient;
