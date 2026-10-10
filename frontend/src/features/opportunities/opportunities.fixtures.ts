import { northwind } from "@/features/companies/companies.fixtures";
import { marcus } from "@/features/contacts/contacts.fixtures";
import {
  lostStage,
  newStage,
  pipeline,
  qualifiedStage,
  wonStage,
} from "@/features/pipeline-stages/pipeline-stages.fixtures";
import type { PipelineStage } from "@/features/pipeline-stages/pipeline-stages.types";
import { adminUser, repUser } from "@/test/render-with-store";

import type {
  BoardColumn,
  Opportunity,
  OpportunityList,
  OpportunityListQuery,
} from "./opportunities.types";

function stageOf(stage: PipelineStage): Opportunity["stage"] {
  return { id: stage.id, name: stage.name, kind: stage.kind };
}

// An opportunity with every field filled in, in the first stage.
export const fleet: Opportunity = {
  id: "ffffffff-ffff-4fff-8fff-fffffffffff1",
  name: "Fleet Expansion",
  value: 48000,
  expectedCloseDate: "2026-11-15",
  stage: stageOf(newStage),
  status: "OPEN",
  closeReason: null,
  closedAt: null,
  contact: { id: marcus.id, name: marcus.name },
  company: { id: northwind.id, name: northwind.name },
  notes: "Wants a pilot first.",
  owner: { id: repUser.id, name: repUser.name },
  convertedFromLead: null,
  lastContactAt: "2026-09-20T08:30:00.000Z",
  createdAt: "2026-10-05T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
};

// An opportunity with only the required fields.
export const walkIn: Opportunity = {
  id: "ffffffff-ffff-4fff-8fff-fffffffffff2",
  name: "Walk-in enquiry",
  value: 0,
  expectedCloseDate: null,
  stage: stageOf(newStage),
  status: "OPEN",
  closeReason: null,
  closedAt: null,
  contact: null,
  company: null,
  notes: null,
  owner: { id: adminUser.id, name: adminUser.name },
  convertedFromLead: null,
  lastContactAt: null,
  createdAt: "2026-10-03T09:00:00.000Z",
  updatedAt: "2026-10-03T09:00:00.000Z",
};

export const vision: Opportunity = {
  ...walkIn,
  id: "ffffffff-ffff-4fff-8fff-fffffffffff3",
  name: "Vision Platform",
  value: 1250.5,
  stage: stageOf(qualifiedStage),
  owner: { id: repUser.id, name: repUser.name },
};

export const wonDeal: Opportunity = {
  ...walkIn,
  id: "ffffffff-ffff-4fff-8fff-fffffffffff4",
  name: "Guest App",
  value: 96000,
  stage: stageOf(wonStage),
  status: "WON",
  closeReason: "Signed after the pilot.",
  closedAt: "2026-10-07T09:00:00.000Z",
};

export const lostDeal: Opportunity = {
  ...walkIn,
  id: "ffffffff-ffff-4fff-8fff-fffffffffff5",
  name: "Document Vault",
  value: 31000,
  stage: stageOf(lostStage),
  status: "LOST",
  closeReason: "Chose a competitor.",
  closedAt: "2026-10-08T09:00:00.000Z",
};

export const allOpportunities: Opportunity[] = [fleet, walkIn, vision, wonDeal, lostDeal];

// The opportunity as the API answers after a move to `stage`.
export function inStage(opportunity: Opportunity, stage: PipelineStage): Opportunity {
  return { ...opportunity, stage: stageOf(stage), status: stage.kind };
}

// The query the list view sends for the plain /opportunities?view=list address.
export const defaultQuery: OpportunityListQuery = {
  sort: "createdAt",
  order: "desc",
  page: 1,
  pageSize: 25,
};

export function opportunityList(
  opportunities: Opportunity[] = allOpportunities,
  meta: Partial<OpportunityList> = {},
): OpportunityList {
  return { opportunities, page: 1, pageSize: 25, total: opportunities.length, ...meta };
}

// The board the API answers for these opportunities: one column for each stage of the
// pipeline, with its count and total.
export function board(opportunities: Opportunity[] = allOpportunities): BoardColumn[] {
  return pipeline.map((stage) => {
    const cards = opportunities.filter((opportunity) => opportunity.stage.id === stage.id);
    return {
      stage: { id: stage.id, name: stage.name, position: stage.position, kind: stage.kind },
      count: cards.length,
      totalValue: cards.reduce((sum, card) => sum + card.value, 0),
      opportunities: cards,
    };
  });
}
