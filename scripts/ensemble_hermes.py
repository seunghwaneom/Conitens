#!/usr/bin/env python3
"""
Hermes profile mapping stub for Conitens persistent agents (ADR-0002).

Hermes provides workspace × role based stateful shells. This module generates
profile names following the convention: cns::{workspace}::{agent_id}

Full Hermes integration is deferred to Batch 4. This stub provides the naming
convention and manifest field population.
"""

from __future__ import annotations


def create_hermes_profile(agent_id: str, workspace: str = "default") -> str:
    """Generate a Hermes profile name for a persistent agent.

    Format: cns::{workspace}::{agent_id}
    """
    return f"cns::{workspace}::{agent_id}"


def parse_hermes_profile(profile: str) -> dict[str, str]:
    """Parse a Hermes profile name into its components."""
    parts = profile.split("::")
    if len(parts) != 3 or parts[0] != "cns":
        raise ValueError(f"Invalid Hermes profile format: {profile}")
    return {"prefix": parts[0], "workspace": parts[1], "agent_id": parts[2]}


# ---------------------------------------------------------------------------
# OpenViking memory provider interface (ADR-0002, Batch 4)
# AGPL-3.0 license review required before real integration.
# ---------------------------------------------------------------------------

def openviking_store(summary: str, *, namespace: str = "default") -> None:
    """Store an approved summary in the OpenViking long-term memory layer.

    Stores approved summaries, reusable playbooks, decisions, and durable
    findings. Only approved content should be stored (approval-gated).

    Args:
        summary: The approved summary text to store.
        namespace: Memory namespace (maps to agent memory_namespace).

    Raises:
        NotImplementedError: OpenViking integration pending AGPL-3.0 license review.
    """
    raise NotImplementedError(
        "OpenViking integration pending AGPL-3.0 license review. "
        "See ADR-0002 §D4 and improvement plan Batch 4 Task 4.3."
    )


def openviking_search(query: str, *, namespace: str = "default", limit: int = 5) -> list[dict]:
    """Search the OpenViking long-term memory layer.

    Retrieves relevant context from cross-session durable memory.
    Uses L1-first retrieval: overview before full read.

    Args:
        query: Natural language search query.
        namespace: Memory namespace to search within.
        limit: Maximum results to return.

    Returns:
        List of matching memory entries with relevance scores.

    Raises:
        NotImplementedError: OpenViking integration pending AGPL-3.0 license review.
    """
    raise NotImplementedError(
        "OpenViking integration pending AGPL-3.0 license review. "
        "See ADR-0002 §D4 and improvement plan Batch 4 Task 4.3."
    )
