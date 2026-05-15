"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultDependencyAnalyzerSkill = void 0;
class DefaultDependencyAnalyzerSkill {
    async analyze(subtasks) {
        // TODO: Implement dependency analysis
        return {
            graph: {},
            parallelGroups: [subtasks.map(t => t.id)],
            hasConflicts: false
        };
    }
}
exports.DefaultDependencyAnalyzerSkill = DefaultDependencyAnalyzerSkill;
