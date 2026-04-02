export type LoadState = "idle" | "loading" | "ready" | "error";

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
