import { prisma } from "../db.ts";
import { getRetellApiKey } from "../providers/configuration.ts";
import {
  createRetellClient,
  listRetellContacts,
  type RetellContactSummary,
} from "./retell.ts";
import type Retell from "retell-sdk";

export interface AuthoritativeContactOptions {
  apiKey?: string;
  client?: Retell;
  maxPages?: number;
  prismaClient?: typeof prisma;
}

/**
 * Fetches all Retell contacts across pages, deduplicates by contactId and phoneNumber,
 * and enforces tenant isolation by excluding any contact whose phone number is associated
 * with another organization in prisma.contact.
 */
export async function getAuthoritativeRetellContacts(
  organizationId: string,
  options?: AuthoritativeContactOptions,
): Promise<RetellContactSummary[]> {
  const apiKey = options?.apiKey ?? getRetellApiKey();
  if (!options?.client && !apiKey) {
    return [];
  }

  const client = options?.client ?? createRetellClient(apiKey as string);
  const rawContacts: RetellContactSummary[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  const maxPages = options?.maxPages ?? 50;

  for (let page = 0; page < maxPages; page += 1) {
    const pageResult = await listRetellContacts(client, {
      limit: 100,
      ...(cursor ? { paginationKey: cursor } : {}),
    });

    rawContacts.push(...pageResult.contacts);

    if (!pageResult.hasMore || !pageResult.nextCursor) {
      break;
    }
    if (seenCursors.has(pageResult.nextCursor)) {
      break;
    }
    seenCursors.add(pageResult.nextCursor);
    cursor = pageResult.nextCursor;
  }

  // Deduplicate by contactId and phoneNumber (keep first occurrence)
  const seenIds = new Set<string>();
  const seenPhones = new Set<string>();
  const deduplicated: RetellContactSummary[] = [];

  for (const contact of rawContacts) {
    if (seenIds.has(contact.contactId)) {
      continue;
    }
    if (contact.phoneNumber && seenPhones.has(contact.phoneNumber)) {
      continue;
    }
    seenIds.add(contact.contactId);
    if (contact.phoneNumber) {
      seenPhones.add(contact.phoneNumber);
    }
    deduplicated.push(contact);
  }

  const phones = deduplicated
    .map((c) => c.phoneNumber)
    .filter((phone): phone is string => Boolean(phone));

  if (phones.length === 0) {
    return deduplicated;
  }

  const db = options?.prismaClient ?? prisma;

  // Tenant isolation: Exclude phone numbers associated with other organizations in prisma.contact
  const otherOrgContacts = await db.contact.findMany({
    where: {
      phone: { in: phones },
      organizationId: { not: organizationId },
    },
    select: { phone: true },
  });

  const otherOrgPhones = new Set(
    otherOrgContacts
      .map((c) => c.phone)
      .filter((phone): phone is string => Boolean(phone)),
  );

  return deduplicated.filter((c) => !otherOrgPhones.has(c.phoneNumber));
}

/**
 * Computes the authoritative contact count for an organization.
 * When Retell is configured, queries Retell and applies deduplication & tenant isolation.
 * When Retell is not configured or errors, falls back to prisma.contact.count.
 */
export async function getAuthoritativeContactCount(
  organizationId: string,
  options?: AuthoritativeContactOptions,
): Promise<number> {
  const apiKey = options?.apiKey ?? getRetellApiKey();
  const db = options?.prismaClient ?? prisma;

  if (options?.client || apiKey) {
    try {
      const contacts = await getAuthoritativeRetellContacts(organizationId, options);
      return contacts.length;
    } catch {
      // Fallback to local CRM contact count on Retell failure
    }
  }

  return db.contact.count({
    where: { organizationId },
  });
}
