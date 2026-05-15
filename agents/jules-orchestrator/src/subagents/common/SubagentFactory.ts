import { PlanningSubagent } from '../PlanningSubagent/PlanningSubagent';
import { SessionSupervisorSubagent, SupervisorInput } from '../SessionSupervisorSubagent/SessionSupervisorSubagent';
import { LLMClient } from '../../llm/LLMClient';
import { Logger } from '../../utils/logger';

export class SubagentFactory {
    constructor(
        private skills: any,
        private llm: LLMClient,
        private logger: Logger
    ) {}

    createPlanningSubagent(): PlanningSubagent {
        return new PlanningSubagent(
            this.skills,
            this.llm,
            this.logger
        );
    }

    createSessionSupervisor(input: SupervisorInput): SessionSupervisorSubagent {
        return new SessionSupervisorSubagent(
            input,
            this.skills,
            this.llm,
            this.logger
        );
    }
}
