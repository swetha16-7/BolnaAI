import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type Retell from "retell-sdk";

import {
  getAuthoritativeRetellContacts,
  getAuthoritativeContactCount,
} from "../lib/server/calls/retell-contacts.ts";
import { createRetellClient } from "../lib/server/calls/retell.ts";

// ---------------------------------------------------------------------------
// 1. Teams Navigation Removal
// ---------------------------------------------------------------------------
test("1. Teams navigation is completely removed from CRM sidebar and routeConfig", () => {
  const pageFile = fs.readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf-8");

  // Ensure Teams sidebar link does not exist
  assert.equal(
    pageFile.includes('href="#/teams"'),
    false,
    "Teams sidebar link (href='#/teams') must not exist in app/page.tsx",
  );
  assert.equal(
    pageFile.includes('data-page="teams"'),
    false,
    "Teams data-page='teams' must not exist in app/page.tsx",
  );

  // Ensure Teams is absent from routeConfig
  assert.equal(
    pageFile.includes('"teams":'),
    false,
    "Teams route definition must not exist in routeConfig in app/page.tsx",
  );

  // Ensure TeamPage component is not imported
  assert.equal(
    pageFile.includes("TeamPage"),
    false,
    "TeamPage must not be imported in app/page.tsx",
  );

  // Check accept-invitation does not route to #/teams
  const acceptInvFile = fs.readFileSync(
    path.join(process.cwd(), "app", "accept-invitation", "page.tsx"),
    "utf-8",
  );
  assert.equal(
    acceptInvFile.includes('href="/#/teams"'),
    false,
    "Accept invitation page must not link to /#/teams",
  );
});

// ---------------------------------------------------------------------------
// 2. Settings Navigation Removal
// ---------------------------------------------------------------------------
test("2. Settings navigation is completely removed from CRM sidebar and routeConfig", () => {
  const pageFile = fs.readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf-8");

  // Ensure Settings sidebar link does not exist
  assert.equal(
    pageFile.includes('href="#/settings"'),
    false,
    "Settings sidebar link (href='#/settings') must not exist in app/page.tsx",
  );
  assert.equal(
    pageFile.includes('data-page="settings"'),
    false,
    "Settings data-page='settings' must not exist in app/page.tsx",
  );

  // Ensure Settings is absent from routeConfig
  assert.equal(
    pageFile.includes('"settings":'),
    false,
    "Settings route definition must not exist in routeConfig in app/page.tsx",
  );

  // Ensure SettingsView is not imported
  assert.equal(
    pageFile.includes("SettingsView"),
    false,
    "SettingsView must not be imported in app/page.tsx",
  );
});

// ---------------------------------------------------------------------------
// 3. Revenue Overview Removal
// ---------------------------------------------------------------------------
test("3. Revenue Overview section is completely removed from DashboardView", () => {
  const dashFile = fs.readFileSync(
    path.join(process.cwd(), "components", "views", "dashboard-view.tsx"),
    "utf-8",
  );

  assert.equal(
    dashFile.includes("RevenueOverviewChart"),
    false,
    "RevenueOverviewChart must not be imported or rendered in dashboard-view.tsx",
  );
  assert.equal(
    dashFile.includes("revenue-overview-chart"),
    false,
    "revenue-overview-chart import path must not exist in dashboard-view.tsx",
  );
});

// ---------------------------------------------------------------------------
// 4. Authoritative Retell Contacts: Tenant Isolation, Deduplication, Pagination
// ---------------------------------------------------------------------------
test("4. getAuthoritativeRetellContacts paginates across pages and deduplicates", async () => {
  const page1Items = [
    {
      contact_id: "c-1",
      phone_number: "+14155550101",
      first_name: "Alice",
      created_timestamp: 1700000000000,
    },
    {
      contact_id: "c-2",
      phone_number: "+14155550102",
      first_name: "Bob",
      created_timestamp: 1700000001000,
    },
    // Duplicate contact_id
    {
      contact_id: "c-1",
      phone_number: "+14155550101",
      first_name: "Alice Duplicate",
      created_timestamp: 1700000002000,
    },
  ];

  const page2Items = [
    // Duplicate phone_number
    {
      contact_id: "c-3",
      phone_number: "+14155550102",
      first_name: "Bob Phone Duplicate",
      created_timestamp: 1700000003000,
    },
    {
      contact_id: "c-4",
      phone_number: "+14155550104",
      first_name: "David",
      created_timestamp: 1700000004000,
    },
  ];

  const mockFetcher: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { pagination_key?: string };
    if (!body.pagination_key) {
      return Response.json({
        has_more: true,
        pagination_key: "cursor-page-2",
        items: page1Items,
      });
    }
    if (body.pagination_key === "cursor-page-2") {
      return Response.json({
        has_more: false,
        items: page2Items,
      });
    }
    return Response.json({ has_more: false, items: [] });
  };

  const client = createRetellClient("mock-api-key", mockFetcher);

  const mockDb = {
    contact: {
      findMany: async () => [],
      count: async () => 0,
    },
  } as any;

  const contacts = await getAuthoritativeRetellContacts("org-tenant-1", {
    client,
    prismaClient: mockDb,
  });

  // Out of c-1, c-2, c-1 (dup), c-3 (phone dup), c-4:
  // Expected unique: c-1, c-2, c-4 (3 unique contacts)
  assert.equal(contacts.length, 3);
  assert.deepEqual(
    contacts.map((c) => c.contactId),
    ["c-1", "c-2", "c-4"],
  );
  assert.deepEqual(
    contacts.map((c) => c.phoneNumber),
    ["+14155550101", "+14155550102", "+14155550104"],
  );
});

test("5. getAuthoritativeRetellContacts enforces tenant isolation against other organizations", async () => {
  const items = [
    {
      contact_id: "c-allowed-1",
      phone_number: "+14155550201",
      first_name: "Tenant Allowed 1",
      created_timestamp: 1700000000000,
    },
    {
      contact_id: "c-foreign",
      phone_number: "+14155550299",
      first_name: "Foreign Tenant Contact",
      created_timestamp: 1700000001000,
    },
    {
      contact_id: "c-allowed-2",
      phone_number: "+14155550202",
      first_name: "Tenant Allowed 2",
      created_timestamp: 1700000002000,
    },
  ];

  const mockFetcher: typeof fetch = async () =>
    Response.json({
      has_more: false,
      items,
    });

  const client = createRetellClient("mock-api-key", mockFetcher);

  // Mock DB returning +14155550299 as belonging to another org
  const mockDb = {
    contact: {
      findMany: async ({ where }: any) => {
        if (where?.organizationId?.not === "org-my-tenant" && where?.phone?.in?.includes("+14155550299")) {
          return [{ phone: "+14155550299" }];
        }
        return [];
      },
      count: async () => 2,
    },
  } as any;

  const contacts = await getAuthoritativeRetellContacts("org-my-tenant", {
    client,
    prismaClient: mockDb,
  });

  // Foreign phone +14155550299 is excluded by tenant isolation
  assert.equal(contacts.length, 2);
  assert.deepEqual(
    contacts.map((c) => c.contactId),
    ["c-allowed-1", "c-allowed-2"],
  );
  assert.equal(
    contacts.some((c) => c.phoneNumber === "+14155550299"),
    false,
  );
});

test("6. getAuthoritativeContactCount returns zero when Retell returns empty items", async () => {
  const mockFetcher: typeof fetch = async () =>
    Response.json({
      has_more: false,
      items: [],
    });

  const client = createRetellClient("mock-api-key", mockFetcher);
  const mockDb = {
    contact: {
      findMany: async () => [],
      count: async () => 0,
    },
  } as any;

  const count = await getAuthoritativeContactCount("org-empty", {
    client,
    prismaClient: mockDb,
  });

  assert.equal(count, 0);
});

test("7. StateContext updates total from providerResult and refreshes dashboard on mutations", () => {
  const stateContextFile = fs.readFileSync(
    path.join(process.cwd(), "context", "StateContext.tsx"),
    "utf-8",
  );

  // Verify providerResult.total is read and used for total & totalPages
  assert.ok(
    stateContextFile.includes('typeof providerResult.total === "number"'),
    "StateContext must check providerResult.total",
  );
  assert.ok(
    stateContextFile.includes("Math.ceil(total / pageSize)"),
    "StateContext must calculate totalPages using total and pageSize",
  );

  // Verify addContact, updateContact, and deleteContact all trigger refreshDashboard() and loadContacts()
  assert.ok(
    stateContextFile.includes("const addContact = async"),
    "addContact exists",
  );
  assert.ok(
    stateContextFile.includes("const deleteContact = async"),
    "deleteContact exists",
  );

  // Count occurrences of loadContacts() and refreshDashboard() in StateContext mutations
  const refreshDashMatches = stateContextFile.match(/refreshDashboard\(\)/g) || [];
  const loadContactsMatches = stateContextFile.match(/loadContacts\(\)/g) || [];
  assert.ok(
    refreshDashMatches.length >= 4,
    "refreshDashboard must be invoked across mutations",
  );
  assert.ok(
    loadContactsMatches.length >= 3,
    "loadContacts must be invoked across contact mutations",
  );
});

test("8. Dashboard route uses getAuthoritativeContactCount", () => {
  const dashboardRouteFile = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "dashboard", "route.ts"),
    "utf-8",
  );

  assert.ok(
    dashboardRouteFile.includes("getAuthoritativeContactCount(organization.id)"),
    "Dashboard GET route must invoke getAuthoritativeContactCount(organization.id)",
  );
});

test("9. Retell contacts route uses getAuthoritativeRetellContacts and returns total", () => {
  const retellContactsRouteFile = fs.readFileSync(
    path.join(process.cwd(), "app", "api", "retell", "contacts", "route.ts"),
    "utf-8",
  );

  assert.ok(
    retellContactsRouteFile.includes("getAuthoritativeRetellContacts(organization.id)"),
    "Retell contacts route must invoke getAuthoritativeRetellContacts(organization.id)",
  );
  assert.ok(
    retellContactsRouteFile.includes("total"),
    "Retell contacts route must return total matching count",
  );
});

test("10. Notification Preferences section is completely removed from ProfileView", () => {
  const profileFile = fs.readFileSync(
    path.join(process.cwd(), "components", "views", "profile-view.tsx"),
    "utf-8",
  );

  assert.equal(
    profileFile.includes("Notification Preferences"),
    false,
    "Notification Preferences must not appear in profile-view.tsx",
  );
  assert.equal(
    profileFile.includes("prefSms"),
    false,
    "prefSms state must not exist in profile-view.tsx",
  );
  assert.equal(
    profileFile.includes("prefDaily"),
    false,
    "prefDaily state must not exist in profile-view.tsx",
  );
  assert.equal(
    profileFile.includes("prefSlack"),
    false,
    "prefSlack state must not exist in profile-view.tsx",
  );
});

test("11. Customers section is completely removed from CRM navigation and interface", () => {
  const crmFile = fs.readFileSync(
    path.join(process.cwd(), "components", "views", "crm-view.tsx"),
    "utf-8",
  );

  assert.equal(
    crmFile.includes('{ key: "customers", label: "Customers" }'),
    false,
    "Customers tab must not exist in crm-view.tsx tabs array",
  );
  assert.equal(
    crmFile.includes('activeTab === "customers"'),
    false,
    "activeTab === 'customers' checks must not exist in crm-view.tsx",
  );

  const pageFile = fs.readFileSync(
    path.join(process.cwd(), "app", "page.tsx"),
    "utf-8",
  );

  assert.equal(
    pageFile.includes('href="#/customers"'),
    false,
    "Customers sidebar navigation link must not exist in app/page.tsx",
  );
  assert.equal(
    pageFile.includes('"customers":'),
    false,
    "Customers must not be defined in routeConfig",
  );
  assert.ok(
    pageFile.includes('routeName === "customers"') && pageFile.includes('window.location.hash = "#/dashboard"'),
    "Navigating to #/customers must redirect to dashboard",
  );
});

test("12. Contacts page and CRM Leads and Follow-Ups functionality are fully preserved", () => {
  const pageFile = fs.readFileSync(
    path.join(process.cwd(), "app", "page.tsx"),
    "utf-8",
  );

  assert.ok(
    pageFile.includes('"contacts": { breadcrumb: "Contacts", component: ContactsView }'),
    "Contacts page must be preserved in routeConfig",
  );
  assert.ok(
    pageFile.includes('href="#/contacts"'),
    "Contacts link must remain in sidebar",
  );
  assert.ok(
    pageFile.includes('href="#/crm"'),
    "CRM link must remain in sidebar",
  );

  const crmFile = fs.readFileSync(
    path.join(process.cwd(), "components", "views", "crm-view.tsx"),
    "utf-8",
  );

  assert.ok(crmFile.includes('{ key: "leads", label: "Leads" }'), "Leads tab must exist in CRM");
  assert.ok(crmFile.includes('{ key: "followups", label: "Follow-Ups" }'), "Follow-Ups tab must exist in CRM");
  assert.ok(!crmFile.includes('{ key: "bookings", label: "Bookings" }'), "Bookings must be removed from CRM tabs");
});

test("13. Dedicated Bookings page is implemented with independent navigation, table columns, and details modal", () => {
  const pageFile = fs.readFileSync(
    path.join(process.cwd(), "app", "page.tsx"),
    "utf-8",
  );

  assert.ok(
    pageFile.includes('"bookings": { breadcrumb: "Bookings", component: BookingsView }'),
    "Bookings route must exist in routeConfig",
  );
  assert.ok(
    pageFile.includes('href="#/bookings"'),
    "Dedicated Bookings link must exist in sidebar",
  );
  assert.ok(
    pageFile.includes("CalendarCheck"),
    "CalendarCheck icon must be used for Bookings navigation",
  );

  const dashboardFile = fs.readFileSync(
    path.join(process.cwd(), "components", "views", "dashboard-view.tsx"),
    "utf-8",
  );
  assert.ok(
    dashboardFile.includes('label: "Appointments"'),
    "Dashboard must have Appointments KPI card",
  );
  assert.ok(
    dashboardFile.includes('href: "#/bookings"'),
    "Dashboard Appointments KPI card must link to #/bookings",
  );

  const bookingsFilePath = path.join(process.cwd(), "components", "views", "bookings-view.tsx");
  assert.ok(fs.existsSync(bookingsFilePath), "BookingsView component file must exist");
  const bookingsFile = fs.readFileSync(bookingsFilePath, "utf-8");

  // Verify Heading & Description
  assert.ok(bookingsFile.includes("Bookings"), "Heading must contain Bookings");
  assert.ok(
    bookingsFile.includes("Manage property viewings and consultation appointments."),
    "Must have specified description",
  );

  // Verify Table Columns
  assert.ok(bookingsFile.includes("Customer Name"), "Must have Customer Name column");
  assert.ok(bookingsFile.includes("Phone Number"), "Must have Phone Number column");
  assert.ok(bookingsFile.includes("Email"), "Must have Email column");
  assert.ok(bookingsFile.includes("Property / Location"), "Must have Property / Location column");
  assert.ok(bookingsFile.includes("Appointment Date"), "Must have Appointment Date column");
  assert.ok(bookingsFile.includes("Appointment Time"), "Must have Appointment Time column");
  assert.ok(bookingsFile.includes("Booking Status"), "Must have Booking Status column");
  assert.ok(bookingsFile.includes("Cal.com Booking Reference"), "Must have Cal.com Booking Reference column");
  assert.ok(bookingsFile.includes("Actions"), "Must have Actions column");

  // Verify Controls & Actions
  assert.ok(bookingsFile.includes("Search bookings"), "Must have search input");
  assert.ok(bookingsFile.includes("Filter by booking status"), "Must have status filter");
  assert.ok(bookingsFile.includes("Filter by appointment date"), "Must have date filter");
  assert.ok(bookingsFile.includes("Refresh"), "Must have refresh button");
  assert.ok(bookingsFile.includes("View Details"), "Must have View Details action");
  assert.ok(bookingsFile.includes("Booking Details"), "Must have booking details dialog");
});
