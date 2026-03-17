/**
 * @module utils/safe-path
 * Path traversal prevention utility.
 */
import { resolve, relative } from "node:path";

/**
 * Validate that a path segment does not escape the base directory.
 * Throws if path traversal is detected (e.g., ../../etc/passwd).
 */
export function safePath(baseDir: string, untrustedSegment: string): string {
  // Reject obvious traversal patterns early
  if (untrustedSegment.includes("..") || untrustedSegment.includes("\0")) {
    throw new Error(`Path traversal detected: "${untrustedSegment}"`);
  }

  const resolved = resolve(baseDir, untrustedSegment);
  const rel = relative(baseDir, resolved);

  // If relative path starts with ".." or is absolute, it escapes the base
  if (rel.startsWith("..") || resolve(baseDir, rel) !== resolved) {
    throw new Error(`Path traversal detected: "${untrustedSegment}"`);
  }

  return resolved;
}

/**
 * Validate that an identifier is safe for use in file names.
 * Only allows alphanumeric, dash, underscore, and dot.
 */
export function validateId(id: string, label: string): void {
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(id)) {
    throw new Error(`Invalid ${label}: "${id}" — must be alphanumeric, dash, underscore, or dot`);
  }
}
