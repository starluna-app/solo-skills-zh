export interface TaskDecompositionSkill {
  analyze(prompt: string, repoContext?: any): Promise<{
    decomposable: boolean;
    reasoning: string;
    subtasks?: Array<{
      id: string;
      prompt: string;
      rationale: string;
      estimatedFiles: string[];
      dependencies: string[];
    }>;
  }>;
}

export class DefaultTaskDecompositionSkill implements TaskDecompositionSkill {
  async analyze(prompt: string, repoContext?: any) {
    // TODO: Implement actual LLM-based decomposition
    return {
      decomposable: false,
      reasoning: "Not implemented yet",
    };
  }
}
