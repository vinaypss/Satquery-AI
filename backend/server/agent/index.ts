import { AnalysisTaskType, ImageInputMetadata, RouterDecision } from '../types/index.js';

export interface AgentContext {
  query: string;
  images: ImageInputMetadata[];
}

export interface TaskRouter {
  routeQuery(context: AgentContext): Promise<RouterDecision>;
}

/**
 * Placeholder Agent Router for Stage 1.
 * AI inference and agentic routing will be implemented in subsequent phases.
 */
export * from './queryParser.js';
