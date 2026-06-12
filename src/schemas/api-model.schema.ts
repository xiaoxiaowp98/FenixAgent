import { z } from "zod/v4";

export const ApiProviderIdParamsSchema = z.object({
  id: z.string().describe("Provider name."),
});

export const ApiProviderUpsertBodySchema = z.object({
  name: z.string().describe("Provider name (unique ID)."),
  displayName: z.string().optional().describe("Display name."),
  protocol: z.enum(["openai", "anthropic"]).default("openai").describe("Protocol type."),
  baseUrl: z.string().optional().describe("API base URL."),
  apiKey: z.string().optional().describe("API key, supports {env:VAR_NAME} placeholder."),
  extraOptions: z.record(z.unknown()).optional().describe("Extra options."),
  publicReadable: z.boolean().optional().describe("Whether publicly readable."),
});

export const ApiProviderUpdateBodySchema = ApiProviderUpsertBodySchema.partial();

export const ApiProviderListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  protocol: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().nullable(),
  modelCount: z.number().int(),
  resourceAccess: z
    .object({
      ownership: z.enum(["internal", "external"]),
      sourceOrganizationId: z.string().optional(),
      sourceOrganizationName: z.string().optional(),
      resourceKey: z.string().optional(),
      manageable: z.boolean(),
      writable: z.boolean(),
      publicReadable: z.boolean().optional(),
    })
    .optional(),
});

export const ApiProviderListResponseSchema = z.object({ providers: z.array(ApiProviderListItemSchema) });

export const ApiProviderDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  protocol: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().nullable(),
  apiKey: z.string().nullable(),
  extraOptions: z.record(z.unknown()).nullable().optional(),
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      modalities: z.unknown().nullable(),
      limitConfig: z.unknown().nullable(),
      cost: z.unknown().nullable(),
    }),
  ),
  resourceAccess: z
    .object({
      ownership: z.enum(["internal", "external"]),
      writable: z.boolean(),
      publicReadable: z.boolean().optional(),
    })
    .optional(),
});

export const ApiProviderDeleteResponseSchema = z.object({ id: z.string(), deleted: z.literal(true) });

export const ApiProviderOnlyParamsSchema = z.object({ providerId: z.string() });

export const ApiModelIdParamsSchema = z.object({ providerId: z.string(), modelId: z.string() });

export const ApiModelUpsertBodySchema = z.object({
  modelId: z.string().describe("Model unique ID."),
  displayName: z.string().optional().describe("Display name."),
  modalities: z.unknown().optional().describe("Modality configuration."),
  limitConfig: z
    .object({ context: z.number().int().positive().optional(), output: z.number().int().positive().optional() })
    .optional(),
  cost: z
    .object({ input: z.number().nonnegative().optional(), output: z.number().nonnegative().optional() })
    .optional(),
  options: z.record(z.unknown()).optional(),
});

export const ApiModelUpdateBodySchema = ApiModelUpsertBodySchema.partial();

export const ApiModelListItemSchema = z.object({
  id: z.string(),
  providerName: z.string(),
  displayName: z.string().nullable(),
  modalities: z.unknown().nullable(),
  limitConfig: z.unknown().nullable(),
  cost: z.unknown().nullable(),
});

export const ApiModelListResponseSchema = z.object({ models: z.array(ApiModelListItemSchema) });

export const ApiModelDetailSchema = z.object({
  id: z.string(),
  providerName: z.string(),
  displayName: z.string().nullable(),
  modalities: z.unknown().nullable(),
  limitConfig: z.unknown().nullable(),
  cost: z.unknown().nullable(),
  options: z.record(z.unknown()).nullable(),
});

export const ApiModelDeleteResponseSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  deleted: z.literal(true),
});
