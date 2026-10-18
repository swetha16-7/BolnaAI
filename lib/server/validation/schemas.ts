import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), {
    message: "Phone number must be in E.164 format.",
  });

export const callCreateSchema = z.object({
  agentId: z.string().min(1, "Agent is required."),
  contactId: z.string().trim().min(1).optional().nullable(),
  destination: phoneSchema,
  consentConfirmed: z.literal(true, {
    error: "Confirm that the contact consented to receive an AI voice call.",
  }),
  idempotencyKey: z.uuid("A valid call request key is required."),
});

export const retellAgentLinkSchema = z.object({
  retellAgentId: z.string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, "Retell agent ID is invalid."),
});

export const agentSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  type: z.string().min(2, "Type is required."),
  timezone: z.string().min(2, "Timezone is required."),
  provider: z.string().optional(),
  voiceName: z.string().optional(),
  languages: z.array(z.string()).default([]),
  greeting: z.string().optional(),
  systemPrompt: z.string().optional(),
  fallback: z.string().optional(),
  speed: z.number().min(0.5).max(2).optional(),
  kbLinks: z.string().optional(),
  kbFiles: z.array(z.object({
    name: z.string(),
    size: z.string(),
    progress: z.number().min(0).max(100),
  })).optional(),
  kbFaqs: z.array(z.object({
    q: z.string(),
    a: z.string(),
  })).optional(),
  workingDays: z.array(z.string()).optional(),
  hoursStart: z.string().optional(),
  hoursEnd: z.string().optional(),
  holidays: z.string().optional(),
  status: z.enum(["active", "paused"]).default("active"),
  idempotencyKey: z.string().trim().max(128).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().trim().optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Valid email is required when supplied.")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || /^\+[1-9]\d{7,14}$/.test(value), {
      message: "Phone number must be in E.164 format.",
    }),
  company: z.string().trim().optional().or(z.literal("")),
  title: z.string().trim().optional().or(z.literal("")),
  source: z.string().trim().optional().or(z.literal("")),
  value: z.string().trim().optional().or(z.literal("")),
  lastContactAt: z.iso.datetime().optional().nullable(),
  voiceConsentGranted: z.boolean().optional(),
  voiceConsentSource: z.enum(["written", "verbal", "web_form", "other"]).optional(),
  voiceConsentEvidence: z.string().trim().min(5).max(500).optional(),
  doNotCall: z.boolean().optional(),
  status: z.enum(["new", "contacted", "qualified", "converted", "inactive"]).default("new"),
});
