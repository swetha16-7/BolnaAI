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
