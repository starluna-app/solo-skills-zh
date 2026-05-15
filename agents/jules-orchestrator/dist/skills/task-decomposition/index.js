"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultTaskDecompositionSkill = void 0;
class DefaultTaskDecompositionSkill {
    async analyze(prompt, repoContext) {
        // TODO: Implement actual LLM-based decomposition
        return {
            decomposable: false,
            reasoning: "Not implemented yet",
        };
    }
}
exports.DefaultTaskDecompositionSkill = DefaultTaskDecompositionSkill;
