/**
 * @module redaction
 * RFC-1.0.1 §13 — Pre-append redaction of secrets from event payloads.
 */

export interface RedactionPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

export interface RedactionResult {
  text: string;
  redacted: boolean;
  fields: string[];
}

/** Default patterns from policies/redaction.yaml */
export const DEFAULT_PATTERNS: readonly RedactionPattern[] = [
  {
    name: "api_key",
    regex: /(?:api[_-]?key|apikey|api[_-]?token)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{20,})/gi,
    replacement: "$1=<REDACTED>",
  },
  {
    name: "bearer_token",
    regex: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
    replacement: "Bearer <REDACTED>",
  },
  {
    name: "env_secret",
    regex: /(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\s*[:=]\s*["']?([^\s"']{8,})/gi,
    replacement: "$1=<REDACTED>",
  },
  {
    name: "connection_string",
    regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']{10,}/gi,
    replacement: "<REDACTED_CONNECTION_STRING>",
  },
  {
    name: "private_key_block",
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE KEY-----[\s\S]*?-----END/gi,
    replacement: "<REDACTED_PRIVATE_KEY>",
  },
];

/**
 * Apply redaction patterns to a string.
 */
export function redactString(input: string, patterns: readonly RedactionPattern[] = DEFAULT_PATTERNS): RedactionResult {
  let text = input;
  let redacted = false;
  const fields: string[] = [];

  for (const p of patterns) {
    // Reset regex lastIndex for global patterns
    p.regex.lastIndex = 0;
    if (p.regex.test(text)) {
      redacted = true;
      fields.push(p.name);
      p.regex.lastIndex = 0;
      text = text.replace(p.regex, p.replacement);
    }
  }

  return { text, redacted, fields };
}

/**
 * Deep-redact all string values in a payload object.
 * Returns the redacted payload and a list of redacted field paths.
 */
export function redactPayload(
  payload: Record<string, unknown>,
  patterns: readonly RedactionPattern[] = DEFAULT_PATTERNS,
  prefix = "payload",
): { payload: Record<string, unknown>; redacted: boolean; redacted_fields: string[] } {
  const result: Record<string, unknown> = {};
  let anyRedacted = false;
  const allFields: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    const fieldPath = `${prefix}.${key}`;
    if (typeof value === "string") {
      const r = redactString(value, patterns);
      result[key] = r.text;
      if (r.redacted) {
        anyRedacted = true;
        allFields.push(fieldPath);
      }
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = redactPayload(value as Record<string, unknown>, patterns, fieldPath);
      result[key] = nested.payload;
      if (nested.redacted) {
        anyRedacted = true;
        allFields.push(...nested.redacted_fields);
      }
    } else {
      result[key] = value;
    }
  }

  return { payload: result, redacted: anyRedacted, redacted_fields: allFields };
}
