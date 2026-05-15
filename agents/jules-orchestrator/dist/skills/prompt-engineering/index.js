"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultPromptEngineeringSkill = void 0;
class DefaultPromptEngineeringSkill {
    async refine(task) {
        // TODO: Enhance prompt with context
        return task.prompt;
    }
}
exports.DefaultPromptEngineeringSkill = DefaultPromptEngineeringSkill;
