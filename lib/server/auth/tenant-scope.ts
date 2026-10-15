export function membershipScope(userId: string) {
  return { userId };
}

export function organizationScope(organizationId: string) {
  return { organizationId };
}
