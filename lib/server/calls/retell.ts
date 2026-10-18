import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  default as Retell,
} from "retell-sdk";

export function createRetellClient(apiKey: string, fetcher: typeof fetch = fetch) {
  return new Retell({
    apiKey,
    timeout: 10_000,
    maxRetries: 0,
    fetch: fetcher,
  });
}

export class RetellCallOwnershipError extends Error {
  constructor() {
    super("Retell call does not belong to the linked organization agent.");
    this.name = "RetellCallOwnershipError";
  }
}

export class RetellCallResponseError extends Error {
  constructor() {
    super("Retell returned an invalid call response.");
    this.name = "RetellCallResponseError";
  }
}

export type RetellAgentSummary = {
  retellAgentId: string;
  name: string;
  channel: "voice" | "chat";
};

export type RetellCallSummary = {
  callId: string;
  agentId: string;
  agentName: string;
  callType: "phone_call" | "web_call";
  direction: "inbound" | "outbound" | null;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  durationSeconds: number | null;
  transcript: string | null;
  summary: string | null;
  recordingUrl: string | null;
};

export class RetellAgentListResponseError extends Error {
  constructor() {
    super("Retell returned an invalid agent list.");
    this.name = "RetellAgentListResponseError";
  }
}

export class RetellCallListResponseError extends Error {
  constructor() {
    super("Retell returned an invalid call list.");
    this.name = "RetellCallListResponseError";
  }
}

export class RetellContactListResponseError extends Error {
  constructor() {
    super("Retell returned an invalid contact list.");
    this.name = "RetellContactListResponseError";
  }
}

const RETELL_AGENT_PAGE_SIZE = 100;
const MAX_RETELL_AGENT_PAGES = 100;
const MAX_RETELL_CURSOR_LENGTH = 2048;
const MAX_RETELL_CONTACT_CURSOR_LENGTH = 2048;

export type RetellContactSummary = {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  createdTimestamp: number;
  lastConversationTimestamp: number | null;
  conversationCount: number | null;
  doNotCall: boolean | null;
};

export async function listRetellContacts(
  client: Retell,
  input: { limit: number; paginationKey?: string },
) {
  const response = await client.contact.list({
    limit: input.limit,
    sort_order: "desc",
    ...(input.paginationKey ? { pagination_key: input.paginationKey } : {}),
  });

  if (
    !response ||
    !Array.isArray(response.items) ||
    typeof response.has_more !== "boolean" ||
    (response.has_more &&
      (typeof response.pagination_key !== "string" ||
        response.pagination_key.length === 0 ||
        response.pagination_key.length > MAX_RETELL_CONTACT_CURSOR_LENGTH ||
        response.pagination_key === input.paginationKey))
  ) {
    throw new RetellContactListResponseError();
  }

  const contacts = response.items.map((contact) => {
    if (
      !contact ||
      typeof contact.contact_id !== "string" ||
      contact.contact_id.length === 0 ||
      typeof contact.phone_number !== "string" ||
      contact.phone_number.length === 0 ||
      typeof contact.created_timestamp !== "number" ||
      !Number.isFinite(contact.created_timestamp) ||
      (contact.first_name !== undefined && typeof contact.first_name !== "string") ||
      (contact.last_name !== undefined && typeof contact.last_name !== "string") ||
      (contact.last_conversation_timestamp !== undefined &&
        (typeof contact.last_conversation_timestamp !== "number" ||
          !Number.isFinite(contact.last_conversation_timestamp))) ||
      (contact.conversation_count !== undefined &&
        (typeof contact.conversation_count !== "number" ||
          !Number.isInteger(contact.conversation_count) ||
          contact.conversation_count < 0)) ||
      (contact.do_not_call !== undefined && typeof contact.do_not_call !== "boolean")
    ) {
      throw new RetellContactListResponseError();
    }

    return {
      contactId: contact.contact_id,
      firstName: contact.first_name ?? null,
      lastName: contact.last_name ?? null,
      phoneNumber: contact.phone_number,
      createdTimestamp: contact.created_timestamp,
      lastConversationTimestamp: contact.last_conversation_timestamp ?? null,
      conversationCount: contact.conversation_count ?? null,
      doNotCall: contact.do_not_call ?? null,
    } satisfies RetellContactSummary;
  });

  return {
    contacts,
    hasMore: response.has_more,
    nextCursor: response.has_more ? response.pagination_key! : null,
  };
}

export async function listRetellAgents(client: Retell): Promise<RetellAgentSummary[]> {
  const agents: RetellAgentSummary[] = [];
  const seenPaginationKeys = new Set<string>();
  let paginationKey: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_RETELL_AGENT_PAGES; pageNumber += 1) {
    const page = await client.agent.list({
      limit: RETELL_AGENT_PAGE_SIZE,
      ...(paginationKey ? { pagination_key: paginationKey } : {}),
    });

    if (!page || !Array.isArray(page.items) || typeof page.has_more !== "boolean") {
      throw new RetellAgentListResponseError();
    }

    for (const item of page.items) {
      if (
        !item ||
        typeof item.agent_id !== "string" ||
        item.agent_id.length === 0 ||
        typeof item.agent_name !== "string" ||
        (item.channel !== "voice" && item.channel !== "chat")
      ) {
        throw new RetellAgentListResponseError();
      }

      agents.push({
        retellAgentId: item.agent_id,
        name: item.agent_name,
        channel: item.channel,
      });
    }

    if (!page.has_more) {
      return agents;
    }

    if (
      typeof page.pagination_key !== "string" ||
      page.pagination_key.length === 0 ||
      seenPaginationKeys.has(page.pagination_key)
    ) {
      throw new RetellAgentListResponseError();
    }

    seenPaginationKeys.add(page.pagination_key);
    paginationKey = page.pagination_key;
  }

  throw new RetellAgentListResponseError();
}

function timestampOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeRecordingUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeRetellCall(
  call: Awaited<ReturnType<Retell["call"]["list"]>>["items"][number] |
    Awaited<ReturnType<Retell["call"]["retrieve"]>>,
  agentName: string,
): RetellCallSummary {
  if (
    !call ||
    typeof call.call_id !== "string" ||
    !call.call_id ||
    typeof call.agent_id !== "string" ||
    !call.agent_id ||
    (call.call_type !== "phone_call" && call.call_type !== "web_call") ||
    typeof call.call_status !== "string"
  ) {
    throw new RetellCallListResponseError();
  }

  const startTimestamp = timestampOrNull(
    "start_timestamp" in call ? call.start_timestamp : null,
  );
  const endTimestamp = timestampOrNull(
    "end_timestamp" in call ? call.end_timestamp : null,
  );
  const durationMs = "duration_ms" in call ? call.duration_ms : null;
  const direction = "direction" in call ? call.direction : null;
  const callStatus = call.call_status;
  const summary = "call_analysis" in call
    ? call.call_analysis?.call_summary
    : null;
  const status = callStatus === "registered"
    ? "initiated"
    : callStatus === "ongoing"
      ? "in_progress"
      : callStatus === "ended"
        ? (endTimestamp ? "completed" : "initiated")
        : callStatus === "not_connected" || callStatus === "error"
          ? "failed"
          : callStatus;

  return {
    callId: call.call_id,
    agentId: call.agent_id,
    agentName,
    callType: call.call_type,
    direction: direction === "inbound" || direction === "outbound" ? direction : null,
    status,
    fromNumber: "from_number" in call && typeof call.from_number === "string"
      ? call.from_number
      : null,
    toNumber: "to_number" in call && typeof call.to_number === "string"
      ? call.to_number
      : null,
    startTimestamp,
    endTimestamp,
    durationSeconds: typeof durationMs === "number" &&
      Number.isFinite(durationMs) &&
      durationMs >= 0
      ? Math.floor(durationMs / 1000)
      : startTimestamp !== null && endTimestamp !== null && endTimestamp >= startTimestamp
        ? Math.floor((endTimestamp - startTimestamp) / 1000)
        : null,
    transcript: "transcript" in call && typeof call.transcript === "string"
      ? call.transcript
      : null,
    summary: typeof summary === "string" ? summary : null,
    recordingUrl: safeRecordingUrl(
      ("scrubbed_recording_url" in call ? call.scrubbed_recording_url : null) ??
        ("recording_url" in call ? call.recording_url : null),
    ),
  };
}

export async function listRetellCalls(
  client: Retell,
  input: {
    agentNames: ReadonlyMap<string, string>;
    limit: number;
    paginationKey?: string;
  },
) {
  if (input.agentNames.size === 0) {
    return { calls: [] as RetellCallSummary[], hasMore: false, nextCursor: null };
  }

  const response = await client.call.list({
    limit: input.limit,
    sort_order: "descending",
    filter_criteria: {
      agent: [...input.agentNames.keys()].map((agentId) => ({ agent_id: agentId })),
    },
    ...(input.paginationKey ? { pagination_key: input.paginationKey } : {}),
  });

  if (
    !response ||
    !Array.isArray(response.items) ||
    typeof response.has_more !== "boolean" ||
    (response.has_more &&
      (typeof response.pagination_key !== "string" ||
        response.pagination_key.length === 0 ||
        response.pagination_key.length > MAX_RETELL_CURSOR_LENGTH ||
        response.pagination_key === input.paginationKey))
  ) {
    throw new RetellCallListResponseError();
  }

  const calls = response.items
    .map((call) => {
      if (!call || typeof call.agent_id !== "string") {
        throw new RetellCallListResponseError();
      }
      const agentName = input.agentNames.get(call.agent_id);
      if (!agentName) {
        return null;
      }
      return normalizeRetellCall(call, agentName);
    })
    .filter((call): call is RetellCallSummary => call !== null);

  return {
    calls,
    hasMore: response.has_more,
    nextCursor: response.has_more ? response.pagination_key! : null,
  };
}

export async function retrieveRetellCall(
  client: Retell,
  callId: string,
  agentName?: string,
  expectedAgentId?: string,
): Promise<RetellCallSummary> {
  const call = await client.call.retrieve(callId);
  const resolvedAgentName = agentName ||
    ("agent_name" in call && typeof call.agent_name === "string" && call.agent_name.trim().length > 0
      ? call.agent_name
      : call.agent_id);
  const summary = normalizeRetellCall(call, resolvedAgentName);
  if (
    summary.callId !== callId ||
    (expectedAgentId !== undefined && summary.agentId !== expectedAgentId)
  ) {
    throw new RetellCallOwnershipError();
  }
  return summary;
}

export function getRetellCallHistoryFailure(error: unknown) {
  return getRetellReadFailure(error, "call history", "linked Retell agent mappings");
}

export function getRetellContactListFailure(error: unknown) {
  return getRetellReadFailure(error, "contacts", "organization contact mappings");
}

export function getRetellAgentListFailure(error: unknown) {
  return getRetellReadFailure(error, "agent discovery", "Retell account access");
}

function getRetellReadFailure(
  error: unknown,
  resource: "agent discovery" | "call history" | "contacts",
  requestConfiguration: string,
) {
  if (error instanceof APIConnectionTimeoutError) {
    return {
      status: 504,
      message: `Retell ${resource} timed out. Try again shortly.`,
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      status: 502,
      message: `Could not connect to Retell for ${resource}. Check network access and try again.`,
    };
  }

  if (error instanceof APIError) {
    if (error.status === 401) {
      return {
        status: 502,
        message: "Retell rejected the configured API key. Verify RETELL_API_KEY is active and belongs to the intended Retell account.",
      };
    }
    if (error.status === 403) {
      return {
        status: 502,
        message: `The Retell API key does not have permission for ${resource}. Check Retell account access.`,
      };
    }
    if (error.status === 429) {
      return {
        status: 503,
        message: `Retell rate-limited ${resource}. Try again shortly.`,
      };
    }
    if (error.status >= 500) {
      return {
        status: 502,
        message: `Retell is temporarily unavailable for ${resource}. Try again shortly.`,
      };
    }

    return {
      status: 502,
      message: `Retell rejected ${resource} (HTTP ${error.status}). Check ${requestConfiguration} and try again.`,
    };
  }

  if (
    error instanceof RetellAgentListResponseError ||
    error instanceof RetellCallListResponseError ||
    error instanceof RetellContactListResponseError
  ) {
    return {
      status: 502,
      message: `Retell returned an unexpected response for ${resource}.`,
    };
  }

  return {
    status: 500,
    message: `An internal error occurred while loading Retell ${resource}.`,
  };
}

export function getRetellCallFailure(error: unknown) {
  const isAmbiguous = error instanceof APIConnectionError ||
    error instanceof APIConnectionTimeoutError ||
    error instanceof RetellCallResponseError;
  return {
    isAmbiguous,
    failureCode: isAmbiguous
      ? "provider_response_unknown"
      : error instanceof APIError
        ? `retell_http_${error.status}`
        : "retell_request_failed",
    failureMessage: isAmbiguous
      ? "The provider response could not be confirmed. Do not retry with a new request key; check call history."
      : "The provider rejected or could not accept the call request.",
  };
}

export async function initiateRetellPhoneCall(
  client: Retell,
  input: {
    fromNumber: string;
    toNumber: string;
    retellAgentId: string;
    callId: string;
    idempotencyKey: string;
  },
) {
  const response = await client.call.createPhoneCall({
    from_number: input.fromNumber,
    to_number: input.toNumber,
    override_agent_id: input.retellAgentId,
    idempotency_key: input.idempotencyKey,
    honor_internal_dnc: true,
    metadata: { applicationCallId: input.callId },
  });

  if (
    typeof response.call_id !== "string" ||
    response.call_id.length === 0 ||
    typeof response.agent_id !== "string" ||
    response.agent_id !== input.retellAgentId ||
    typeof response.call_status !== "string" ||
    response.call_status.length === 0
  ) {
    throw new RetellCallResponseError();
  }

  return response;
}

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export class RetellPhoneNumberResolutionError extends Error {
  readonly code:
    | "no_phone_number_configured"
    | "ambiguous_phone_number_mapping"
    | "invalid_phone_number_format"
    | "provider_list_failed";

  constructor(
    message: string,
    code:
      | "no_phone_number_configured"
      | "ambiguous_phone_number_mapping"
      | "invalid_phone_number_format"
      | "provider_list_failed",
  ) {
    super(message);
    this.name = "RetellPhoneNumberResolutionError";
    this.code = code;
  }
}

export async function resolveRetellAgentPhoneNumber(
  client: Retell,
  retellAgentId: string,
): Promise<string> {
  const seenPaginationKeys = new Set<string>();
  let paginationKey: string | undefined;
  const matchingPhoneNumbers: string[] = [];

  for (let page = 0; page < MAX_RETELL_AGENT_PAGES; page += 1) {
    let listResponse: Awaited<ReturnType<Retell["phoneNumber"]["list"]>>;
    try {
      listResponse = await client.phoneNumber.list(
        paginationKey ? { pagination_key: paginationKey } : undefined,
      );
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new RetellPhoneNumberResolutionError(
        "Could not load phone numbers from Retell.",
        "provider_list_failed",
      );
    }

    const items = Array.isArray(listResponse)
      ? listResponse
      : Array.isArray(listResponse?.items)
        ? listResponse.items
        : null;

    if (!items) {
      throw new RetellPhoneNumberResolutionError(
        "Retell returned an invalid phone number list response.",
        "provider_list_failed",
      );
    }

    for (const item of items) {
      if (!item || typeof item.phone_number !== "string") {
        continue;
      }

      // Requirement 2: Use outbound_agents for this association; do not treat inbound_agents alone as sufficient.
      const isOutboundAssociated = Array.isArray(item.outbound_agents) &&
        item.outbound_agents.some(
          (agent: { agent_id?: string } | null | undefined) => Boolean(agent && agent.agent_id === retellAgentId),
        );

      if (isOutboundAssociated) {
        matchingPhoneNumbers.push(item.phone_number.trim());
      }
    }

    const hasMore = !Array.isArray(listResponse) && Boolean(listResponse?.has_more);
    const nextKey = !Array.isArray(listResponse) && typeof listResponse?.pagination_key === "string"
      ? listResponse.pagination_key
      : undefined;

    if (!hasMore || !nextKey) {
      break;
    }

    if (seenPaginationKeys.has(nextKey)) {
      break;
    }
    seenPaginationKeys.add(nextKey);
    paginationKey = nextKey;
  }

  const distinctNumbers = [...new Set(matchingPhoneNumbers)];

  if (distinctNumbers.length === 0) {
    throw new RetellPhoneNumberResolutionError(
      `No outbound phone number is explicitly configured for Retell agent ${retellAgentId} in outbound_agents.`,
      "no_phone_number_configured",
    );
  }

  if (distinctNumbers.length > 1) {
    throw new RetellPhoneNumberResolutionError(
      `Multiple conflicting outbound phone numbers (${distinctNumbers.join(", ")}) are configured for Retell agent ${retellAgentId}.`,
      "ambiguous_phone_number_mapping",
    );
  }

  const resolvedNumber = distinctNumbers[0];
  if (!E164_PATTERN.test(resolvedNumber)) {
    throw new RetellPhoneNumberResolutionError(
      `Configured outbound phone number ${resolvedNumber} is not a valid E.164 number.`,
      "invalid_phone_number_format",
    );
  }

  return resolvedNumber;
}

export function buildRetellSystemPrompt(data: {
  type?: string | null;
  systemPrompt?: string | null;
  fallback?: string | null;
  kbFaqs?: unknown;
  workingDays?: string[] | null;
  hoursStart?: string | null;
  hoursEnd?: string | null;
  timezone?: string | null;
}): string {
  const parts: string[] = [];
  if (data.systemPrompt?.trim()) {
    parts.push(data.systemPrompt.trim());
  } else if (data.type?.trim()) {
    parts.push(`You are a professional voice agent acting as ${data.type.trim()}.`);
  }

  if (data.fallback?.trim()) {
    parts.push(`Fallback instructions: If you cannot answer a question or encounter an error, say: "${data.fallback.trim()}".`);
  }

  if (Array.isArray(data.kbFaqs) && data.kbFaqs.length > 0) {
    const validFaqs = data.kbFaqs
      .filter((faq): faq is { q: string; a: string } =>
        Boolean(
          faq &&
            typeof faq === "object" &&
            typeof (faq as { q?: unknown }).q === "string" &&
            typeof (faq as { a?: unknown }).a === "string" &&
            (faq as { q: string }).q.trim(),
        ),
      )
      .map((faq) => `Q: ${faq.q.trim()}\nA: ${faq.a.trim()}`);
    if (validFaqs.length > 0) {
      parts.push(`Knowledge Base FAQs:\n${validFaqs.join("\n\n")}`);
    }
  }

  if (data.workingDays && data.workingDays.length > 0 && data.hoursStart && data.hoursEnd) {
    parts.push(`Operating Hours (${data.timezone || "UTC"}): ${data.workingDays.join(", ")} from ${data.hoursStart} to ${data.hoursEnd}.`);
  }

  return parts.join("\n\n");
}

export function resolveRetellVoiceId(voiceName?: string | null, _provider?: string | null): string {
  if (!voiceName || !voiceName.trim()) {
    return "retell-Cimo";
  }
  const normalized = voiceName.trim();

  // Map known BolnaAI preset names to Retell voice IDs
  switch (normalized) {
    case "Aura-Asteria":
    case "Aura-Athena":
      return "11labs-Jenny";
    case "Aura-Orpheus":
      return "11labs-Adrian";
    case "Cartesia-Sonic":
      return "retell-Cimo";
    case "Cartesia-British":
      return "11labs-George";
    case "Kokoro-Default":
      return "retell-Cimo";
    case "Coqui-Cloned-Voice":
      return "retell-Cimo";
  }

  // If already prefixed by a recognized voice provider in Retell
  if (/^(retell|11labs|cartesia|openai|fish_audio|minimax|inworld)-/i.test(normalized)) {
    return normalized;
  }

  return "retell-Cimo";
}

export type CreateRetellAgentInput = {
  name: string;
  type?: string | null;
  timezone?: string | null;
  voiceName?: string | null;
  provider?: string | null;
  speed?: number | null;
  greeting?: string | null;
  systemPrompt?: string | null;
  fallback?: string | null;
  kbFaqs?: unknown;
  workingDays?: string[] | null;
  hoursStart?: string | null;
  hoursEnd?: string | null;
};

export type CreatedRetellAgentResult = {
  retellAgentId: string;
  llmId: string;
};

export class RetellAgentCreateResponseError extends Error {
  constructor(message = "Retell returned an invalid agent creation response.") {
    super(message);
    this.name = "RetellAgentCreateResponseError";
  }
}

export async function createRetellAgentWithLlm(
  client: Retell,
  input: CreateRetellAgentInput,
): Promise<CreatedRetellAgentResult> {
  const generalPrompt = buildRetellSystemPrompt(input);
  const beginMessage = input.greeting?.trim() || null;

  // 1. Create the Retell LLM response engine
  const llmResponse = await client.llm.create({
    general_prompt: generalPrompt || null,
    begin_message: beginMessage,
  });

  if (!llmResponse || typeof llmResponse.llm_id !== "string" || !llmResponse.llm_id) {
    throw new RetellAgentCreateResponseError("Retell LLM creation did not return a valid llm_id.");
  }

  const llmId = llmResponse.llm_id;

  // 2. Create the Retell Agent attached to the LLM
  try {
    const voiceId = resolveRetellVoiceId(input.voiceName, input.provider);
    const voiceSpeed = typeof input.speed === "number" && input.speed >= 0.5 && input.speed <= 2.0
      ? input.speed
      : 1.0;

    const agentResponse = await client.agent.create({
      agent_name: input.name.trim(),
      response_engine: {
        type: "retell-llm",
        llm_id: llmId,
      },
      voice_id: voiceId,
      voice_speed: voiceSpeed,
    });

    if (!agentResponse || typeof agentResponse.agent_id !== "string" || !agentResponse.agent_id) {
      throw new RetellAgentCreateResponseError("Retell agent creation did not return a valid agent_id.");
    }

    return {
      retellAgentId: agentResponse.agent_id,
      llmId,
    };
  } catch (error) {
    // If agent creation fails after LLM was created, clean up orphaned LLM
    try {
      await client.llm.delete(llmId);
    } catch {
      // Best-effort cleanup
    }
    throw error;
  }
}

export async function deleteRetellAgentAndLlm(
  client: Retell,
  retellAgentId: string,
  llmId?: string | null,
): Promise<void> {
  try {
    await client.agent.delete(retellAgentId);
  } catch (error) {
    console.error(`Failed to clean up newly created Retell agent ${retellAgentId}:`, error);
  }
  if (llmId) {
    try {
      await client.llm.delete(llmId);
    } catch (error) {
      console.error(`Failed to clean up newly created Retell LLM ${llmId}:`, error);
    }
  }
}

export function getRetellAgentCreateFailure(error: unknown) {
  if (error instanceof APIConnectionTimeoutError) {
    return {
      status: 504,
      message: "Retell agent creation timed out. Try again shortly.",
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      status: 502,
      message: "Could not connect to Retell for agent creation. Check network access and try again.",
    };
  }

  if (error instanceof APIError) {
    if (error.status === 401) {
      return {
        status: 502,
        message: "Retell rejected the configured API key. Verify RETELL_API_KEY is active and belongs to the intended Retell account.",
      };
    }
    if (error.status === 403) {
      return {
        status: 502,
        message: "The Retell API key does not have permission to create agents. Check Retell account access.",
      };
    }
    if (error.status === 429) {
      return {
        status: 503,
        message: "Retell rate-limited agent creation. Try again shortly.",
      };
    }
    if (error.status >= 500) {
      return {
        status: 502,
        message: "Retell is temporarily unavailable for agent creation. Try again shortly.",
      };
    }

    return {
      status: 502,
      message: `Retell rejected agent creation (HTTP ${error.status}). Check configuration and try again.`,
    };
  }

  if (error instanceof RetellAgentCreateResponseError) {
    return {
      status: 502,
      message: error.message,
    };
  }

  return {
    status: 500,
    message: "An internal error occurred while creating the Retell agent.",
  };
}

