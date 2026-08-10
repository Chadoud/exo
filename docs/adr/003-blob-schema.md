# ADR-003: Sync Blob Schema Versioning

## Status

Accepted

## Context

Clients and relay must agree on envelope shape; schema evolves over time.

## Decision

- Every blob carries `schema_version` (integer, currently `1`)
- Major version mismatch → client rejects pull chunk with actionable UI ("Update app")
- Collections v1 (exported + relay allowlist): `memory_entries`, `conversations`, `tasks`, `activity_entries`
- Canonical schema: `sync/schemas/blob-envelope.json`

## Consequences

- CI contract tests validate golden fixtures against JSON Schema
- Relay stores `schema_version` in metadata index for filtering
