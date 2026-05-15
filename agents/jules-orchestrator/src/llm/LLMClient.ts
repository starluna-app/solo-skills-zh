export interface LLMClient {
  generateText(prompt: string): Promise<string>;
}
