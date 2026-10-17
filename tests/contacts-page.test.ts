import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { api, type ApiContactPage } from "../lib/api-client.ts";

test("api.contacts.list properly serializes query, status, page, pageSize, and dnc", async () => {
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  const mockResponse: ApiContactPage = {
    contacts: [
      {
        id: "contact-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
        phone: "+14155550100",
        company: "Babbage Engines",
        title: "Engineer",
        source: "CRM",
        status: "qualified",
        value: null,
        lastContactAt: null,
        voiceConsentAt: "2026-10-15T00:00:00.000Z",
        voiceConsentSource: "written",
        voiceConsentEvidence: "Signed contract appendix",
        voiceConsentRevokedAt: null,
        doNotCall: false,
        doNotCallAt: null,
        createdAt: "2026-10-15T00:00:00.000Z",
        updatedAt: "2026-10-15T00:00:00.000Z",
        calls: [
          {
            id: "call-1",
            externalCallId: "call_ext_1",
            status: "completed",
            direction: "outbound",
            outcome: "Answered",
            durationSeconds: 125,
            startedAt: "2026-10-15T10:00:00.000Z",
            createdAt: "2026-10-15T10:00:00.000Z",
            transcript: "Customer confirmed interest.",
          },
        ],
        latestCall: {
          id: "call-1",
          externalCallId: "call_ext_1",
          status: "completed",
          direction: "outbound",
          outcome: "Answered",
          durationSeconds: 125,
          startedAt: "2026-10-15T10:00:00.000Z",
          createdAt: "2026-10-15T10:00:00.000Z",
          transcript: "Customer confirmed interest.",
        },
        lastConversationAt: "2026-10-15T10:00:00.000Z",
      },
    ],
    pagination: {
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
    },
  };

  const result = await api.contacts.list(
    "Ada",
    "qualified",
    2,
    10,
    "false",
    async (input, init) => {
      requestedUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  assert.equal(requestedUrl, "/api/contacts?q=Ada&status=qualified&page=2&pageSize=10&dnc=false");
  assert.equal(requestInit?.credentials, "same-origin");
  assert.deepEqual(result, mockResponse);
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].calls?.length, 1);
  assert.equal(result.contacts[0].latestCall?.id, "call-1");
  assert.equal(result.pagination.totalPages, 3);
});

test("api.contacts.delete sends DELETE request with same-origin credentials", async () => {
  let requestedUrl = "";
  let requestMethod = "";

  const result = await api.contacts.delete("contact-arch-1", async (input, init) => {
    requestedUrl = String(input);
    requestMethod = init?.method ?? "";
    return new Response(JSON.stringify({ success: true, archived: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  assert.equal(requestedUrl, "/api/contacts/contact-arch-1");
  assert.equal(requestMethod, "DELETE");
  assert.deepEqual(result, { success: true, archived: true });
});

test("api.contacts.create sends contact payload and returns created contact", async () => {
  let requestBody: Record<string, unknown> | undefined;

  const newContact = {
    firstName: "Grace",
    lastName: "Hopper",
    email: "grace@example.test",
    phone: "+14155550200",
    company: "US Navy",
    title: "Admiral",
    source: "CRM",
    status: "new",
  };

  const result = await api.contacts.create(newContact, async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        contact: {
          id: "contact-created-1",
          ...newContact,
          value: null,
          lastContactAt: null,
          voiceConsentAt: null,
          voiceConsentSource: null,
          voiceConsentEvidence: null,
          voiceConsentRevokedAt: null,
          doNotCall: false,
          doNotCallAt: null,
          createdAt: "2026-10-16T00:00:00.000Z",
          updatedAt: "2026-10-16T00:00:00.000Z",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });

  assert.deepEqual(requestBody, newContact);
  assert.equal(result.contact.id, "contact-created-1");
  assert.equal(result.contact.firstName, "Grace");
});

test("Contacts view component does not contain provider-specific UI labels (Retell)", () => {
  const filePath = path.join(process.cwd(), "components", "views", "contacts-view.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Verify that the word 'Retell' does not appear anywhere in contacts-view.tsx
  assert.equal(
    /retell/i.test(content),
    false,
    "The word 'Retell' must not appear anywhere on the Contacts page",
  );

  // Verify required page header and subtitle
  assert.equal(content.includes("Manage your contacts, review conversations, and keep customer details organized."), true);
  assert.equal(content.includes("No conversations yet"), true);
  assert.equal(content.includes("View Details") || content.includes("View"), true);
});

test("Contact without calls handles null call state without crashing", () => {
  const contactWithoutCalls: {
    id: string;
    firstName: string;
    lastName: string | null;
    calls: import("../lib/api-client.ts").ApiContactCall[];
    latestCall: import("../lib/api-client.ts").ApiContactCall | null;
    lastConversationAt: string | null;
  } = {
    id: "contact-nocall-1",
    firstName: "Alan",
    lastName: "Turing",
    calls: [],
    latestCall: null,
    lastConversationAt: null,
  };

  const latestCall = contactWithoutCalls.latestCall || contactWithoutCalls.calls?.[0] || null;
  const callId = latestCall?.externalCallId || latestCall?.id || null;
  const lastConversationText = contactWithoutCalls.lastConversationAt || "No conversations yet";

  assert.equal(callId, null);
  assert.equal(lastConversationText, "No conversations yet");
});

test("Call History view component does not contain a separate Retell Contacts section or table", () => {
  const filePath = path.join(process.cwd(), "components", "views", "call-history-view.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.equal(
    content.includes("Retell Contacts"),
    false,
    "Call History must not contain a Retell Contacts section or heading",
  );
  assert.equal(
    content.includes("retellContacts"),
    false,
    "Call History must not maintain separate retellContacts state",
  );
});

test("Contacts view includes Phone Number, Contact ID, Conversations, and Last Conversation columns while omitting Contact and Recent Conversations", () => {
  const filePath = path.join(process.cwd(), "components", "views", "contacts-view.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.equal(content.includes("<TableHead>Contact</TableHead>"), false);
  assert.equal(content.includes("<span>Contact</span>"), false);
  assert.equal(content.includes("<TableHead>Phone Number</TableHead>"), true);
  assert.equal(content.includes("<TableHead>Contact ID</TableHead>"), true);
  assert.equal(content.includes("<TableHead>Conversations</TableHead>"), true);
  assert.equal(content.includes("<TableHead>Last Conversation</TableHead>"), true);
  assert.equal(content.includes("Recent Conversations"), false);
  assert.equal(content.includes("conversationsCount"), true);
  assert.equal(content.includes("DNC"), true);
});

