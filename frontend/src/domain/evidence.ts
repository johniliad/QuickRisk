import { z } from 'zod';

/** The only optional organisation-specific observation in QuickRisk 2.0. */
export const organisationEvidenceSchema = z
  .object({
    materialLossEventCount: z.number().int().min(0).max(1000).nullable().optional(),
  })
  .strict();

export type OrganisationEvidence = z.infer<typeof organisationEvidenceSchema>;

export const EMPTY_ORGANISATION_EVIDENCE: OrganisationEvidence = {
  materialLossEventCount: null,
};
