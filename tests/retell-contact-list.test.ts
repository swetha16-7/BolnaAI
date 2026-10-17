import test from "node:test";
import assert from "node:assert/strict";

import {
  createRetellClient,
  listRetellContacts,
  RetellContactListResponseError,
  type RetellContactSummary,
} from "../lib/server/calls/retell.ts";
import { selectUniquelyOwnedRetellContacts } from "../lib/server/calls/retell-ownership.ts";

test("Retell contact listing paginates and returns only approved contact fields", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = createRetellClient("test-retell-key", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      has_more: true,
      pagination_key: "next-contact-page",
      total: 2,
      items: [{
        contact_id: "retell-contact-1",
        org_id: "retell-org",
        phone_number: "+14155550100",
        first_name: "Taylor",
        last_name: "Morgan",
        created_timestamp: 1_800_000_000_000,
        last_conversation_timestamp: 1_800_000_065_000,
        conversation_count: 3,
        do_not_call: true,
        contact_memory: "private memory must not leak",
        custom_fields: { private: "must not leak" },
        external_id: "private external identifier",
      }],
    });
  });

  const result = await listRetellContacts(client, {
    limit: 25,
    paginationKey: "current-contact-page",
  });

  assert.deepEqual(requestBody, {
    limit: 25,
    sort_order: "desc",
    pagination_key: "current-contact-page",
  });
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "next-contact-page");
  assert.deepEqual(result.contacts, [{
    contactId: "retell-contact-1",
    firstName: "Taylor",
    lastName: "Morgan",
    phoneNumber: "+14155550100",
    createdTimestamp: 1_800_000_000_000,
    lastConversationTimestamp: 1_800_000_065_000,
    conversationCount: 3,
    doNotCall: true,
  }]);
  assert.equal(JSON.stringify(result).includes("private memory"), false);
  assert.equal(JSON.stringify(result).includes("private external identifier"), false);
});

test("malformed Retell contact pages are rejected", async () => {
  const malformedPage = createRetellClient("test-retell-key", async () =>
    Response.json({
      has_more: true,
      pagination_key: "same-cursor",
      items: [],
    }),
  );
  await assert.rejects(
    listRetellContacts(malformedPage, { limit: 25, paginationKey: "same-cursor" }),
    (error: unknown) => error instanceof RetellContactListResponseError,
  );

  const malformedContact = createRetellClient("test-retell-key", async () =>
    Response.json({
      has_more: false,
      items: [{
        contact_id: "retell-contact-invalid",
        phone_number: "+14155550100",
        created_timestamp: "not-a-timestamp",
      }],
    }),
  );
  await assert.rejects(
    listRetellContacts(malformedContact, { limit: 25 }),
    (error: unknown) => error instanceof RetellContactListResponseError,
  );
});

test("Retell contacts are shown only for a unique exact phone match in this organization", () => {
  const makeContact = (contactId: string, phoneNumber: string): RetellContactSummary => ({
    contactId,
    firstName: null,
    lastName: null,
    phoneNumber,
    createdTimestamp: 1_800_000_000_000,
    lastConversationTimestamp: null,
    conversationCount: null,
    doNotCall: null,
  });

  const visible = selectUniquelyOwnedRetellContacts("org-a", [
    makeContact("matched", "+14155550100"),
    makeContact("foreign-only", "+14155550200"),
    makeContact("shared", "+14155550300"),
    makeContact("ambiguous-local", "+14155550400"),
    makeContact("ambiguous-provider-1", "+14155550500"),
    makeContact("ambiguous-provider-2", "+14155550500"),
    makeContact("not-exact", "+14155550600"),
  ], [
    { id: "local-a", organizationId: "org-a", phone: "+14155550100" },
    { id: "local-foreign", organizationId: "org-b", phone: "+14155550200" },
    { id: "local-shared-a", organizationId: "org-a", phone: "+14155550300" },
    { id: "local-shared-b", organizationId: "org-b", phone: "+14155550300" },
    { id: "local-ambiguous-a", organizationId: "org-a", phone: "+14155550400" },
    { id: "local-ambiguous-b", organizationId: "org-a", phone: "+14155550400" },
    { id: "local-near-match", organizationId: "org-a", phone: "4155550600" },
  ]);

  assert.deepEqual(visible.map((contact) => contact.contactId), ["matched"]);
});
