export function createForwardAuthHeaders(
  token: string,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  const trimmedToken = token.trim();
  return {
    Authorization: `Bearer ${trimmedToken}`,
    "X-Conitens-Forward-Token": trimmedToken,
    ...extraHeaders,
  };
}
