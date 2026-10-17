import test from "node:test";
import assert from "node:assert/strict";

import { membershipScope, organizationScope } from "../lib/server/auth/tenant-scope.ts";

test("membership queries are scoped to the authenticated user id", () => {
  const authenticatedUserId = "user-a";
  const scope = membershipScope(authenticatedUserId);

  assert.deepEqual(scope, { userId: "user-a" });
  assert.equal("organizationId" in scope, false);
});

test("organization-owned queries receive only the authorized organization id", () => {
  const authorizedOrganizationId = "org-a";

  assert.deepEqual(organizationScope(authorizedOrganizationId), {
    organizationId: "org-a",
  });
});
