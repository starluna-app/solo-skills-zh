export interface JulesSession {
    id: string;
    state: string;
    // Add other fields as necessary
}

export interface JulesSessionCreateParams {
    prompt: string;
    sourceContext: any;
    requirePlanApproval: boolean;
    automationMode: string;
    title: string;
}
