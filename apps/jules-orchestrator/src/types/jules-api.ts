export interface JulesSession {
    id: string;
    state: string;
    // Add other fields as necessary
    outputs?: {
        pullRequestUrl?: string;
        pullRequestTitle?: string;
        summary?: string;
        filesChanged?: string[];
    };
}

export interface JulesSessionCreateParams {
    prompt: string;
    sourceContext: any;
    requirePlanApproval: boolean;
    automationMode: string;
    title: string;
}

export type JulesActivity = any;
