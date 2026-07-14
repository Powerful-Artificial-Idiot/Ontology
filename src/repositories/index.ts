export type { KnowledgeRepository } from "../../packages/knowledge-contracts/src/index";
export { HttpKnowledgeRepository } from "../../packages/ontology-client/src/index";
export { MockKnowledgeRepository } from "./MockKnowledgeRepository";

import { MockKnowledgeRepository } from "./MockKnowledgeRepository";

export const knowledgeRepository = new MockKnowledgeRepository();
