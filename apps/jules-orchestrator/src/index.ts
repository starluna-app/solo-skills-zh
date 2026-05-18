#!/usr/bin/env node
import { Command } from 'commander';
import { OrchestratorAgent } from './agent/OrchestratorAgent';
import { AnthropicLLMClient } from './llm/AnthropicLLMClient';
import { SubagentFactory } from './subagents/common/SubagentFactory';
import { FileStateStore } from './storage/FileStateStore';
import { logger } from './utils/logger';
import { DefaultTaskDecompositionSkill } from './skills/task-decomposition';
import { DefaultDependencyAnalyzerSkill } from './skills/dependency-analyzer';
import { DefaultPromptEngineeringSkill } from './skills/prompt-engineering';
import { DefaultJulesApiClient } from './skills/jules-api-client';
import { DefaultSessionMonitor } from './skills/session-monitor';
import { UserRequest } from './types/core';

const program = new Command();

program
  .name('jules-orch')
  .description('Jules Orchestrator Agent CLI')
  .version('1.0.0');

program
  .command('run')
  .description('Execute a high-level task')
  .argument('<prompt>', 'The natural language prompt describing the task')
  .option('-r, --repo <repo>', 'Target repository (e.g., owner/repo)')
  .option('-b, --branch <branch>', 'Target branch')
  .option('--require-approval', 'Require approval before executing plan')
  .option('--parallelism <level>', 'Parallelism hint (prefer, avoid, auto)', 'auto')
  .action(async (prompt, options) => {
    console.log(`Starting Orchestrator with prompt: "${prompt}"`);
    console.log('Options:', options);

    const llm = new AnthropicLLMClient();
    const skills = {
      taskDecomposition: new DefaultTaskDecompositionSkill(),
      dependencyAnalyzer: new DefaultDependencyAnalyzerSkill(),
      promptEngineering: new DefaultPromptEngineeringSkill(),
      julesClient: new DefaultJulesApiClient(),
      sessionMonitor: new DefaultSessionMonitor(),
    };
    const subagentFactory = new SubagentFactory(skills, llm, logger);
    const store = new FileStateStore();

    const agent = new OrchestratorAgent(
      llm,
      skills,
      subagentFactory,
      store,
      logger
    );

    const input: UserRequest = {
      prompt,
      repoHint: options.repo,
      branch: options.branch,
      requireApproval: options.requireApproval,
      parallelismHint: options.parallelism,
    };

    try {
      const outcome = await agent.handleRequest(input);
      logger.info({ outcome }, 'Orchestrator finished handling request');
    } catch (error) {
      logger.error({ error }, 'Error running orchestrator');
    }
  });

program
  .command('status')
  .description('View status of ongoing tasks')
  .action(() => {
    console.log('Status command not implemented yet.');
  });

program.parse(process.argv);
