import Anthropic from '@anthropic-ai/sdk';
import { LLMClient } from './LLMClient';
import { config } from '../config/Config';

export class AnthropicLLMClient implements LLMClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
    });
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.content[0].type === 'text') {
      return response.content[0].text;
    }

    return '';
  }
}
