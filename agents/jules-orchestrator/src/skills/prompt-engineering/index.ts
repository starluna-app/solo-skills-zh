import { Subtask } from '../../types/core';

export interface PromptEngineeringSkill {
  refine(task: Subtask): Promise<string>;
}

export class DefaultPromptEngineeringSkill implements PromptEngineeringSkill {
  async refine(task: Subtask): Promise<string> {
    // TODO: Enhance prompt with context
    return task.prompt;
  }
}
