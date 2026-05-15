import { PlanningSubagent } from '../PlanningSubagent/PlanningSubagent';
import { SessionSupervisorSubagent, SupervisorInput } from '../SessionSupervisorSubagent/SessionSupervisorSubagent';
import { PrReviewerSubagent, PrReviewerInput } from '../PrReviewerSubagent/PrReviewerSubagent';
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

    createPrReviewer(input: PrReviewerInput): PrReviewerSubagent {
        return new PrReviewerSubagent(
            this.skills,
            this.llm,
            this.logger
        );
    }
}
