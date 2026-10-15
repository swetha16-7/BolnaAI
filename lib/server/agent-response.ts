export function presentAgent<
  T extends { providerLinks: Array<{ providerId: string }> },
>(agent: T) {
  const { providerLinks, ...publicAgent } = agent;
  return {
    ...publicAgent,
    retellAgentId: providerLinks[0]?.providerId ?? null,
  };
}
