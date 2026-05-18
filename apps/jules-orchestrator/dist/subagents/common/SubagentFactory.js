"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubagentFactory = void 0;
const PlanningSubagent_1 = require("../PlanningSubagent/PlanningSubagent");
const SessionSupervisorSubagent_1 = require("../SessionSupervisorSubagent/SessionSupervisorSubagent");
const PrReviewerSubagent_1 = require("../PrReviewerSubagent/PrReviewerSubagent");
class SubagentFactory {
    skills;
    llm;
    logger;
    constructor(skills, llm, logger) {
        this.skills = skills;
        this.llm = llm;
        this.logger = logger;
    }
    createPlanningSubagent() {
        return new PlanningSubagent_1.PlanningSubagent(this.skills, this.llm, this.logger);
    }
    createSessionSupervisor(input) {
        return new SessionSupervisorSubagent_1.SessionSupervisorSubagent(input, this.skills, this.llm, this.logger);
    }
    createPrReviewer(input) {
        return new PrReviewerSubagent_1.PrReviewerSubagent(this.skills, this.llm, this.logger);
    }
}
exports.SubagentFactory = SubagentFactory;
