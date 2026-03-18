/**
 * @module approval
 * RFC-1.0.1 §9 — Approval gates and TOCTOU hash binding.
 */

export type RiskLevel = "low" | "medium" | "high";
export type ApprovalAction = "auto_approve" | "log_and_approve" | "human_approval" | "validator_required" | "human_review" | "deny";

export interface ApprovalResult {
  action: ApprovalAction;
  reason?: string;
}

// ---------------------------------------------------------------------------
// TOCTOU hash — §9.2
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of a normalized payload for TOCTOU binding.
 * The payload is JSON-stringified with sorted keys.
 */
export async function computeSubjectHash(payload: Record<string, unknown>): Promise<string> {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  const buffer = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify that the approval subject hash matches the current payload.
 * Returns true if hashes match.
 */
export async function verifySubjectHash(
  expectedHash: string,
  currentPayload: Record<string, unknown>,
): Promise<boolean> {
  const currentHash = await computeSubjectHash(currentPayload);
  return expectedHash === currentHash;
}

// ---------------------------------------------------------------------------
// High-risk shell patterns — §9.1
// ---------------------------------------------------------------------------

export const HIGH_RISK_SHELL_PATTERNS = [
  "rm -rf", "DROP TABLE", "curl", "wget", "ssh",
] as const;

export function isHighRiskCommand(command: string): boolean {
  const lower = command.toLowerCase();
  return HIGH_RISK_SHELL_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}
