/**
 * @module schema-version
 * RFC-1.0.1 §4.1 — Canonical schema version string.
 */
export const SCHEMA_VERSION = "conitens.event.v1" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;
