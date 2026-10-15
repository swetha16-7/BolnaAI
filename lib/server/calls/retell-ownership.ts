import { prisma } from "../db.ts";
import { organizationScope } from "../auth/tenant-scope.ts";
import type { RetellContactSummary } from "./retell.ts";

export function selectUniquelyOwnedRetellContacts(
  organizationId: string,
  retellContacts: RetellContactSummary[],
  matchingLocalContacts: Array<{
    id: string;
    organizationId: string;
    phone: string;
  }>,
) {
  const localContactsByPhone = new Map<string, typeof matchingLocalContacts>();
  for (const contact of matchingLocalContacts) {
    const contacts = localContactsByPhone.get(contact.phone) ?? [];
    contacts.push(contact);
    localContactsByPhone.set(contact.phone, contacts);
  }

  const retellContactsByPhone = new Map<string, RetellContactSummary[]>();
  for (const contact of retellContacts) {
    const contacts = retellContactsByPhone.get(contact.phoneNumber) ?? [];
    contacts.push(contact);
    retellContactsByPhone.set(contact.phoneNumber, contacts);
  }

  const safeContacts: RetellContactSummary[] = [];
  for (const [phone, providerContacts] of retellContactsByPhone) {
    const localContacts = localContactsByPhone.get(phone) ?? [];
    if (
      providerContacts.length !== 1 ||
      localContacts.length !== 1 ||
      localContacts[0].organizationId !== organizationId
    ) {
      continue;
    }
    safeContacts.push(providerContacts[0]);
  }

  return safeContacts;
}

export function selectUniquelyOwnedRetellAgents(
  organizationId: string,
  localAgents: Array<{
    id: string;
    name: string;
    providerLinks: Array<{ providerId: string }>;
  }>,
  allLinks: Array<{
    providerId: string;
    agent: { id: string; organizationId: string };
  }>,
): Map<string, string> {
  const localLinks = new Map<string, { agentId: string; name: string }[]>();
  for (const agent of localAgents) {
    if (agent.providerLinks.length !== 1) continue;
    const providerId = agent.providerLinks[0].providerId;
    const linkedAgents = localLinks.get(providerId) ?? [];
    linkedAgents.push({ agentId: agent.id, name: agent.name });
    localLinks.set(providerId, linkedAgents);
  }

  const globalLinks = new Map<string, typeof allLinks>();
  for (const link of allLinks) {
    const links = globalLinks.get(link.providerId) ?? [];
    links.push(link);
    globalLinks.set(link.providerId, links);
  }

  const safeMappings = new Map<string, string>();
  for (const [providerId, candidates] of localLinks) {
    const providerLinks = globalLinks.get(providerId) ?? [];
    if (
      candidates.length === 1 &&
      providerLinks.length === 1 &&
      providerLinks[0].agent.id === candidates[0].agentId &&
      providerLinks[0].agent.organizationId === organizationId
    ) {
      safeMappings.set(providerId, candidates[0].name);
    }
  }

  return safeMappings;
}

export async function getOrganizationRetellAgentNames(
  organizationId: string,
  agentId?: string,
): Promise<Map<string, string>> {
  const agents = await prisma.agent.findMany({
    where: {
      ...organizationScope(organizationId),
      ...(agentId ? { id: agentId } : {}),
      providerLinks: { some: { provider: "retell" } },
    },
    select: {
      id: true,
      name: true,
      providerLinks: {
        where: { provider: "retell" },
        select: { providerId: true },
        take: 2,
      },
    },
  });

  const localProviderIds = [...new Set(
    agents.flatMap((agent) =>
      agent.providerLinks.length === 1
        ? [agent.providerLinks[0].providerId]
        : [],
    ),
  )];
  if (localProviderIds.length === 0) return new Map();

  const allLinks = await prisma.providerLink.findMany({
    where: {
      provider: "retell",
      providerId: { in: localProviderIds },
    },
    select: {
      providerId: true,
      agent: {
        select: {
          id: true,
          organizationId: true,
        },
      },
    },
  });
  return selectUniquelyOwnedRetellAgents(organizationId, agents, allLinks);
}
