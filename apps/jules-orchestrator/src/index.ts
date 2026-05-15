#!/usr/bin/env node
import { Command } from 'commander';

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

    // TODO: Initialize OrchestratorAgent with real dependencies and call handleRequest
    console.log('Not fully implemented yet.');
  });

program
  .command('status')
  .description('View status of ongoing tasks')
  .action(() => {
    console.log('Status command not implemented yet.');
  });

program.parse(process.argv);
