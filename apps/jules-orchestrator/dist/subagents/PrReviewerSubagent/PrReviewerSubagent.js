"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrReviewerSubagent = exports.PrReviewerScope = void 0;
exports.PrReviewerScope = {
    decisions: [
        "决定 PR 是否通过测试和 lint",
        "决定是否解决简单的合并冲突",
        "决定 PR 是否可以安全合并到 main",
    ],
    escalateOn: [
        "遇到无法自动解决的复杂合并冲突",
        "测试或 lint 失败且无法自动修复",
        "GitHub API 调用出现严重错误",
    ],
};
class PrReviewerSubagent {
    skills;
    llm;
    logger;
    id = 'pr-reviewer-subagent';
    scope = exports.PrReviewerScope;
    constructor(skills, // Will need gh-cli skill or similar
    llm, logger) {
        this.skills = skills;
        this.llm = llm;
        this.logger = logger;
    }
    async run(input) {
        this.logger.info({ event: 'pr_review_start', repo: input.repo });
        // TODO: Implement the following logic:
        // 1. Get list of open PRs
        // 2. For each PR:
        //    a. Checkout PR branch
        //    b. Rebase on target branch (main)
        //    c. Run lint, format, and tests
        //    d. If success, push and merge
        //    e. Else, comment on PR and skip
        return {
            outcome: 'COMPLETED',
            reasoning: 'PR Reviewer Subagent initialized (logic placeholder)',
            toolCalls: []
        };
    }
}
exports.PrReviewerSubagent = PrReviewerSubagent;
