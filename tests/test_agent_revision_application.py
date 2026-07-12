from __future__ import annotations

import getpass
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_contracts import parse_simple_yaml
from ensemble_episode_closure import ClosureRequest, close_episode
from ensemble_events import append_event, load_events
from ensemble_improvement_candidate_model import CandidateProposal
from ensemble_improvement_candidates import decide_improvement_candidate, propose_improvement_candidate
from ensemble_registry import load_skill_manifests


BASE_MANIFEST = {
    "schema_v": 1,
    "skill_id": "context-curator",
    "family": "context",
    "summary": "Refresh operational context without overwriting canonical task truth.",
    "triggers": ["context", "latest-context"],
    "inputs": ["workspace"],
    "outputs": ["context-snapshot"],
    "approval_class": "readonly",
    "default_workflow": "wf.research-plan-validate",
    "compatible_runtimes": ["codex", "claude", "gemini", "local"],
}

NEXT_MANIFEST = {
    **BASE_MANIFEST,
    "summary": "Refresh operational context and keep task truth event-sourced.",
    "outputs": ["context-snapshot", "authority-digest"],
}

SECOND_MANIFEST = {
    **NEXT_MANIFEST,
    "summary": "Refresh operational context through a second bounded revision.",
    "outputs": ["context-snapshot", "authority-digest", "revision-status"],
}


def _revision_api():
    from ensemble_agent_revisions import (
        AgentRevisionError,
        apply_agent_skill_revision,
        propose_agent_skill_revision,
        rebuild_agent_skill_revisions,
        rollback_agent_skill_revision,
        serialize_skill_manifest,
        show_agent_skill_revision,
    )

    return {
        "AgentRevisionError": AgentRevisionError,
        "apply": apply_agent_skill_revision,
        "propose": propose_agent_skill_revision,
        "rebuild": rebuild_agent_skill_revisions,
        "rollback": rollback_agent_skill_revision,
        "serialize": serialize_skill_manifest,
        "show": show_agent_skill_revision,
    }


class AgentSkillRevisionApplicationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.workspace = Path(self.temp_dir.name)
        self.skill_path = self.workspace / ".agent" / "skills" / "context-curator.yaml"
        self.skill_path.parent.mkdir(parents=True, exist_ok=True)
        self.skill_path.write_text(
            (ROOT / ".agent" / "skills" / "context-curator.yaml").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        self._write_matching_owner()
        self.candidate = self._approved_skill_patch_candidate()

    def test_proposal_appends_revision_and_apply_request_without_file_changes(self) -> None:
        api = _revision_api()
        before_bytes = self.skill_path.read_bytes()

        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )

        self.assertEqual(proposed["artifact_kind"], "agent_skill_revision")
        self.assertEqual(proposed["schema_v"], 1)
        self.assertEqual(proposed["status"], "pending_apply")
        self.assertEqual(proposed["candidate_id"], self.candidate["candidate_id"])
        self.assertEqual(proposed["candidate_version"], self.candidate["candidate_version"])
        self.assertEqual(proposed["candidate_proposal_sha256"], self.candidate["proposal_sha256"])
        self.assertEqual(proposed["target_ref"], "skills/context-curator")
        self.assertEqual(proposed["base_source_sha256"], self._file_sha256(self.skill_path))
        self.assertEqual(proposed["base_canonical_sha256"], self._manifest_sha256(api, BASE_MANIFEST))
        self.assertEqual(proposed["next_canonical_sha256"], self._manifest_sha256(api, NEXT_MANIFEST))
        self.assertTrue(proposed["revision_id"].startswith("revision-"))
        self.assertEqual(proposed["approval_request_id"], f"approval-{proposed['revision_id']}")
        self.assertNotIn("base_manifest", proposed)
        self.assertNotIn("next_manifest", proposed)
        self.assertEqual(self.skill_path.read_bytes(), before_bytes)

        revision_events = self._revision_events()
        self.assertEqual([event["type"] for event in revision_events], [
            "improvement.revision_proposed",
            "approval.requested",
        ])
        request_payload = revision_events[1]["payload"]
        self.assertEqual(request_payload["action_type"], "apply_agent_revision")
        self.assertEqual(request_payload["revision_id"], proposed["revision_id"])
        self.assertEqual(request_payload["target_ref"], "skills/context-curator")
        self.assertNotIn("manifest", json.dumps(request_payload))
        self.assertNotIn(str(self.workspace.resolve()), json.dumps(request_payload))

    def test_candidate_and_target_gates_fail_before_revision_events(self) -> None:
        api = _revision_api()
        pending = self._pending_skill_patch_candidate(summary="Pending revision candidate.")
        wrong_kind = self._approved_skill_patch_candidate(kind="workflow_revision", target_ref="workflows/context")
        baseline = self._snapshot()
        cases = (
            (pending["candidate_id"], NEXT_MANIFEST),
            (wrong_kind["candidate_id"], NEXT_MANIFEST),
            (self.candidate["candidate_id"], {**NEXT_MANIFEST, "skill_id": "repo-map"}),
            (self.candidate["candidate_id"], BASE_MANIFEST),
            (self.candidate["candidate_id"], {**NEXT_MANIFEST, "target_ref": "../.notes/OWNER.json"}),
        )

        for candidate_id, manifest in cases:
            with self.subTest(candidate_id=candidate_id, manifest=manifest):
                with self.assertRaises(api["AgentRevisionError"]):
                    api["propose"](self.workspace, candidate_id, manifest, actor="supervisor")
                self.assertEqual(self._snapshot(), baseline)
                self.assertEqual(self._revision_events(), [])

    def test_missing_and_symlink_targets_fail_before_revision_events(self) -> None:
        api = _revision_api()
        missing_candidate = self._approved_skill_patch_candidate(
            target_ref="skills/missing-skill",
            summary="Approved candidate for a missing target.",
        )
        baseline = self._snapshot()

        with self.assertRaises(api["AgentRevisionError"]):
            api["propose"](
                self.workspace,
                missing_candidate["candidate_id"],
                {**NEXT_MANIFEST, "skill_id": "missing-skill"},
                actor="supervisor",
            )
        self.assertEqual(self._snapshot(), baseline)

        if hasattr(Path, "symlink_to"):
            self.skill_path.unlink()
            outside = self.workspace / "outside.yaml"
            outside.write_text(api["serialize"](BASE_MANIFEST), encoding="utf-8")
            try:
                self.skill_path.symlink_to(outside)
            except (OSError, NotImplementedError):
                self.skipTest("symlink creation is unavailable on this host")
            with self.assertRaises(api["AgentRevisionError"]):
                api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
            self.assertFalse(any(event["type"] == "improvement.revision_proposed" for event in load_events(self.workspace)))

    def test_agent_parent_link_cannot_redirect_a_revision_outside_the_workspace(self) -> None:
        api = _revision_api()
        linked_workspace = self._event_only_workspace()
        external_agent = Path(tempfile.mkdtemp(dir=self.temp_dir.name)) / "agent-root"
        external_skill = external_agent / "skills" / "context-curator.yaml"
        external_skill.parent.mkdir(parents=True, exist_ok=True)
        external_skill.write_text(api["serialize"](BASE_MANIFEST), encoding="utf-8")
        try:
            (linked_workspace / ".agent").symlink_to(external_agent, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("directory symlink creation is unavailable on this host")

        baseline = external_skill.read_bytes()
        with self.assertRaises(api["AgentRevisionError"]):
            api["propose"](
                linked_workspace,
                self.candidate["candidate_id"],
                NEXT_MANIFEST,
                actor="supervisor",
            )
        self.assertEqual(external_skill.read_bytes(), baseline)
        self.assertFalse(
            any(event["type"] == "improvement.revision_proposed" for event in load_events(linked_workspace))
        )

    def test_manifest_schema_and_privacy_fail_closed(self) -> None:
        api = _revision_api()
        cases = (
            {**NEXT_MANIFEST, "unknown": "field"},
            {**NEXT_MANIFEST, "schema_v": True},
            {**NEXT_MANIFEST, "triggers": [{"nested": "value"}]},
            {**NEXT_MANIFEST, "triggers": "context"},
            {**NEXT_MANIFEST, "family": ["context"]},
            {**NEXT_MANIFEST, "skill_id": "Context Curator"},
            {**NEXT_MANIFEST, "summary": "copied raw transcript excerpt"},
            {**NEXT_MANIFEST, "summary": "token=super-secret-value"},
            {**NEXT_MANIFEST, "summary": r"read C:\\Users\\alice\\secret.txt"},
            {**NEXT_MANIFEST, "summary": "line\u0001control"},
            {**NEXT_MANIFEST, "summary": "ambiguous: value"},
            {**NEXT_MANIFEST, "family": "context ops"},
            {**NEXT_MANIFEST, "default_workflow": "wf research"},
            {**NEXT_MANIFEST, "triggers": ["latest context"]},
            {**NEXT_MANIFEST, "triggers": [f"trigger-{index}" for index in range(51)]},
            {**NEXT_MANIFEST, "summary": "s" * 5001},
        )
        baseline = len(load_events(self.workspace))

        for manifest in cases:
            with self.subTest(manifest=manifest):
                with self.assertRaises(api["AgentRevisionError"]):
                    api["propose"](self.workspace, self.candidate["candidate_id"], manifest, actor="supervisor")
                self.assertEqual(len(load_events(self.workspace)), baseline)

    def test_canonical_serializer_round_trips_through_registry_without_warnings(self) -> None:
        api = _revision_api()

        serialized = api["serialize"](NEXT_MANIFEST)

        self.assertEqual(parse_simple_yaml(serialized), NEXT_MANIFEST)
        self.skill_path.write_text(serialized, encoding="utf-8")
        [row] = load_skill_manifests(self.workspace)
        self.assertEqual(row["data"], NEXT_MANIFEST)
        self.assertEqual(row["warnings"], [])
        self.assertEqual(row["errors"], [])
        self.assertTrue(serialized.endswith("\n"))
        self.assertNotIn("\r\n", serialized)

    def test_metadata_only_candidate_id_cannot_apply(self) -> None:
        api = _revision_api()
        baseline = self._snapshot()

        with self.assertRaises(api["AgentRevisionError"]):
            api["apply"](self.workspace, self.candidate["candidate_id"], reason_code="accepted_as_bounded")

        self.assertEqual(self._snapshot(), baseline)
        self.assertFalse(any(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace)))

    def test_owner_and_apply_approval_are_separate_from_candidate_review(self) -> None:
        api = _revision_api()
        proposed = api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        self._remove_owner()

        with self.assertRaises(api["AgentRevisionError"]):
            api["apply"](self.workspace, proposed["revision_id"], reason_code="accepted_as_bounded")

        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), (ROOT / ".agent" / "skills" / "context-curator.yaml").read_text(encoding="utf-8"))
        self.assertFalse(any(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace)))

    def test_apply_is_event_first_and_append_failure_preserves_target(self) -> None:
        api = _revision_api()
        proposed = api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        import ensemble_agent_revisions as service

        real_append = service.append_event
        observed: list[str] = []

        def fail_on_applied(*args, **kwargs):
            observed.append(kwargs["event_type"])
            if kwargs["event_type"] == "improvement.revision_applied":
                raise RuntimeError("applied append failed")
            return real_append(*args, **kwargs)

        before = self.skill_path.read_bytes()
        with patch.object(service, "append_event", side_effect=fail_on_applied):
            with self.assertRaisesRegex(RuntimeError, "applied append failed"):
                api["apply"](self.workspace, proposed["revision_id"], reason_code="accepted_as_bounded")

        self.assertEqual(observed, ["approval.granted", "improvement.revision_applied"])
        self.assertEqual(self.skill_path.read_bytes(), before)

    def test_projection_failure_after_applied_event_is_recoverable_by_rebuild(self) -> None:
        api = _revision_api()
        proposed = api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        import ensemble_agent_revisions as service

        before = self.skill_path.read_bytes()
        with patch.object(service.os, "replace", side_effect=OSError("replace failed")):
            with self.assertRaises(api["AgentRevisionError"]):
                api["apply"](self.workspace, proposed["revision_id"], reason_code="accepted_as_bounded")

        self.assertEqual(self.skill_path.read_bytes(), before)
        self.assertTrue(any(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace)))
        rebuilt = api["rebuild"](self.workspace)
        self.assertEqual(rebuilt["rebuilt"], [{"target_ref": "skills/context-curator", "sha256": self._manifest_sha256(api, NEXT_MANIFEST)}])
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](NEXT_MANIFEST))

    def test_stale_target_hash_blocks_apply_before_terminal_events(self) -> None:
        api = _revision_api()
        proposed = api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        self.skill_path.write_text(api["serialize"]({**BASE_MANIFEST, "summary": "Externally modified."}), encoding="utf-8")

        with self.assertRaises(api["AgentRevisionError"]):
            api["apply"](self.workspace, proposed["revision_id"], reason_code="accepted_as_bounded")

        event_types = [event["type"] for event in load_events(self.workspace)]
        self.assertNotIn("approval.granted", event_types[event_types.index("improvement.revision_proposed") + 1 :])
        self.assertNotIn("improvement.revision_applied", event_types)

    def test_rollback_is_event_first_owner_gated_and_idempotent(self) -> None:
        api = _revision_api()
        proposed = api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        api["apply"](self.workspace, proposed["revision_id"], reason_code="accepted_as_bounded")
        applied_bytes = self.skill_path.read_bytes()

        rolled_back = api["rollback"](self.workspace, proposed["revision_id"], reason_code="operator_revert")

        self.assertEqual(rolled_back["status"], "rolled_back")
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](BASE_MANIFEST))
        rollback_events = [event["type"] for event in self._revision_events()][-3:]
        self.assertEqual(rollback_events, ["approval.requested", "approval.granted", "improvement.revision_rolled_back"])
        duplicate = api["rollback"](self.workspace, proposed["revision_id"], reason_code="operator_revert")
        self.assertEqual(duplicate["status"], "rolled_back")
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](BASE_MANIFEST))
        self.assertNotEqual(self.skill_path.read_bytes(), applied_bytes)

    def test_rebuild_from_authority_events_is_deterministic_after_apply_and_rollback(self) -> None:
        api = _revision_api()
        proposed = api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        api["apply"](self.workspace, proposed["revision_id"], reason_code="accepted_as_bounded")
        clean_workspace = self._event_only_workspace(with_owner=True)

        first = api["rebuild"](clean_workspace)
        first_bytes = (clean_workspace / ".agent" / "skills" / "context-curator.yaml").read_bytes()
        second = api["rebuild"](clean_workspace)
        self.assertEqual(second, first)
        self.assertEqual((clean_workspace / ".agent" / "skills" / "context-curator.yaml").read_bytes(), first_bytes)
        self.assertEqual(first_bytes.decode("utf-8"), api["serialize"](NEXT_MANIFEST))

        api["rollback"](self.workspace, proposed["revision_id"], reason_code="operator_revert")
        rolled_back_workspace = self._event_only_workspace(with_owner=True)
        api["rebuild"](rolled_back_workspace)
        self.assertEqual(
            (rolled_back_workspace / ".agent" / "skills" / "context-curator.yaml").read_text(encoding="utf-8"),
            api["serialize"](BASE_MANIFEST),
        )

    def test_rebuild_requires_live_owner_before_materializing_authority_events(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )
        ownerless = self._event_only_workspace()

        with self.assertRaises(api["AgentRevisionError"]):
            api["rebuild"](ownerless)

        self.assertFalse((ownerless / ".agent").exists())

    def test_public_show_is_metadata_only_and_rejects_forged_revision_history(self) -> None:
        api = _revision_api()
        proposed = api["propose"](self.workspace, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        source = next(event for event in load_events(self.workspace) if event["type"] == "improvement.revision_proposed")
        forged = deepcopy(source["payload"])
        forged["revision_id"] = "revision-forged"
        forged["candidate_id"] = "candidate-forged-v1"
        append_event(
            self.workspace,
            event_type="improvement.revision_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement", "revision_id": forged["revision_id"]},
            payload=forged,
        )

        detail = api["show"](self.workspace, proposed["revision_id"])

        serialized = json.dumps(detail, ensure_ascii=False)
        self.assertEqual(detail["revision_id"], proposed["revision_id"])
        self.assertNotIn("base_manifest", detail)
        self.assertNotIn("next_manifest", detail)
        self.assertNotIn("Refresh operational context", serialized)
        self.assertNotIn(str(self.workspace.resolve()), serialized)
        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](self.workspace, "revision-forged")

    def test_forged_applied_event_without_exact_owner_grant_fails_closed(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        revision_payload = self._revision_proposal_payload(proposed["revision_id"])
        append_event(
            self.workspace,
            event_type="improvement.revision_applied",
            actor={"type": "agent", "name": "forged"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=self._terminal_payload(revision_payload, "apply_agent_revision"),
        )

        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](self.workspace, proposed["revision_id"])

    def test_forged_duplicate_proposal_envelope_and_unknown_fields_fail_closed(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        forged = deepcopy(self._revision_proposal_payload(proposed["revision_id"]))
        forged["unexpected"] = "field"
        append_event(
            self.workspace,
            event_type="improvement.revision_proposed",
            actor={"type": "system", "name": "forged"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=forged,
        )

        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](self.workspace, proposed["revision_id"])

    def test_single_forged_proposal_envelope_and_candidate_digest_fail_closed(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        proposal = next(
            event
            for event in load_events(self.workspace)
            if event["type"] == "improvement.revision_proposed"
            and event.get("payload", {}).get("revision_id") == proposed["revision_id"]
        )
        prior_events = [
            event
            for event in load_events(self.workspace)
            if event is not proposal
            and event.get("payload", {}).get("revision_id") != proposed["revision_id"]
        ]

        cases = (
            ({"type": "system", "name": "forged"}, proposal["scope"], proposal["payload"]),
            (proposal["actor"], {"surface": "wrong", "revision_id": proposed["revision_id"]}, proposal["payload"]),
            (
                proposal["actor"],
                proposal["scope"],
                {**proposal["payload"], "candidate_proposal_sha256": "0" * 64},
            ),
        )
        for actor, scope, payload in cases:
            with self.subTest(actor=actor, scope=scope, digest=payload.get("candidate_proposal_sha256")):
                forged_workspace = self._event_only_workspace(prior_events)
                append_event(
                    forged_workspace,
                    event_type="improvement.revision_proposed",
                    actor=actor,
                    scope=scope,
                    payload=payload,
                )
                with self.assertRaises(api["AgentRevisionError"]):
                    api["show"](forged_workspace, proposed["revision_id"])

    def test_terminal_reason_must_match_exact_owner_grant(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        import ensemble_agent_revisions as service

        real_append = service.append_event

        def fail_terminal(*args, **kwargs):
            if kwargs["event_type"] == "improvement.revision_applied":
                raise RuntimeError("terminal append failed")
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=fail_terminal):
            with self.assertRaisesRegex(RuntimeError, "terminal append failed"):
                api["apply"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="accepted_as_bounded",
                )
        revision = self._revision_proposal_payload(proposed["revision_id"])
        append_event(
            self.workspace,
            event_type="improvement.revision_applied",
            actor={"type": "owner", "name": "local-owner"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=self._terminal_payload(
                revision,
                "apply_agent_revision",
                reason_code="operator_revert",
            ),
        )

        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](self.workspace, proposed["revision_id"])

    def test_duplicate_grants_and_rollback_terminals_fail_closed(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )
        applied_events = load_events(self.workspace)
        apply_grant = next(
            event
            for event in applied_events
            if event["type"] == "approval.granted"
            and event.get("payload", {}).get("action_type") == "apply_agent_revision"
        )
        duplicate_grant_workspace = self._event_only_workspace(applied_events)
        append_event(
            duplicate_grant_workspace,
            event_type=apply_grant["type"],
            actor=apply_grant["actor"],
            scope=apply_grant["scope"],
            payload=apply_grant["payload"],
        )
        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](duplicate_grant_workspace, proposed["revision_id"])

        api["rollback"](
            self.workspace,
            proposed["revision_id"],
            reason_code="operator_revert",
        )
        rolled_events = load_events(self.workspace)
        terminal = next(
            event
            for event in reversed(rolled_events)
            if event["type"] == "improvement.revision_rolled_back"
        )
        duplicate_terminal_workspace = self._event_only_workspace(rolled_events)
        append_event(
            duplicate_terminal_workspace,
            event_type=terminal["type"],
            actor=terminal["actor"],
            scope=terminal["scope"],
            payload=terminal["payload"],
        )
        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](duplicate_terminal_workspace, proposed["revision_id"])

    def test_revision_proposal_envelope_must_match_expected_actor_and_scope(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )

        self._rewrite_events(
            lambda event: {
                **event,
                "actor": {"type": "system", "name": "forged"},
                "scope": {"surface": "wrong-surface", "revision_id": proposed["revision_id"]},
            }
            if event["type"] == "improvement.revision_proposed"
            and event.get("payload", {}).get("revision_id") == proposed["revision_id"]
            else event
        )

        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](self.workspace, proposed["revision_id"])

    def test_apply_rejects_reason_mismatch_after_existing_owner_grant(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        revision = self._revision_proposal_payload(proposed["revision_id"])
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "owner", "name": "local-owner"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=self._approval_payload(
                revision,
                "apply_agent_revision",
                decision_reason_code="accepted_as_bounded",
            ),
        )

        with self.assertRaises(api["AgentRevisionError"]):
            api["apply"](
                self.workspace,
                proposed["revision_id"],
                reason_code="followup_required",
            )

        grants = [
            event
            for event in load_events(self.workspace)
            if event["type"] == "approval.granted"
            and event.get("payload", {}).get("action_type") == "apply_agent_revision"
        ]
        self.assertEqual(len(grants), 1)
        self.assertFalse(any(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace)))

    def test_duplicate_rollback_request_and_grant_fail_closed(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )
        revision = self._revision_proposal_payload(proposed["revision_id"])
        request = self._approval_payload(revision, "rollback_agent_revision")
        grant = self._approval_payload(
            revision,
            "rollback_agent_revision",
            decision_reason_code="operator_revert",
        )
        append_event(
            self.workspace,
            event_type="approval.requested",
            actor={"type": "agent", "name": "rollback"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=request,
        )
        append_event(
            self.workspace,
            event_type="approval.requested",
            actor={"type": "agent", "name": "rollback"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=request,
        )
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "owner", "name": "local-owner"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=grant,
        )
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "owner", "name": "local-owner"},
            scope={"surface": "agent-improvement", "revision_id": proposed["revision_id"]},
            payload=grant,
        )

        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](self.workspace, proposed["revision_id"])

    def test_wrong_scope_and_preproposal_revision_events_fail_closed(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        revision = self._revision_proposal_payload(proposed["revision_id"])
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "owner", "name": "local-owner"},
            scope={"surface": "wrong-surface", "revision_id": proposed["revision_id"]},
            payload=self._approval_payload(
                revision,
                "apply_agent_revision",
                decision_reason_code="accepted_as_bounded",
            ),
        )
        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](self.workspace, proposed["revision_id"])

        events = load_events(self.workspace)
        proposal = next(
            event
            for event in events
            if event["type"] == "improvement.revision_proposed"
            and event.get("payload", {}).get("revision_id") == proposed["revision_id"]
        )
        request = next(
            event
            for event in events
            if event["type"] == "approval.requested"
            and event.get("payload", {}).get("revision_id") == proposed["revision_id"]
        )
        prior = [
            event
            for event in events
            if event.get("payload", {}).get("revision_id") != proposed["revision_id"]
            and event["type"] != "improvement.revision_proposed"
        ]
        reordered = self._event_only_workspace([*prior, request, proposal])
        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](reordered, proposed["revision_id"])

    def test_candidate_approval_must_precede_revision_proposal(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        events = load_events(self.workspace)
        review_grant = next(
            event
            for event in events
            if event["type"] == "approval.granted"
            and event.get("payload", {}).get("action_type") == "review_improvement_candidate"
            and event.get("payload", {}).get("candidate_id") == self.candidate["candidate_id"]
        )
        revision_events = [
            event
            for event in events
            if event.get("payload", {}).get("revision_id") == proposed["revision_id"]
            or event["type"] == "improvement.revision_proposed"
        ]
        prior = [event for event in events if event is not review_grant and event not in revision_events]
        reordered = self._event_only_workspace([*prior, *revision_events, review_grant])

        with self.assertRaises(api["AgentRevisionError"]):
            api["show"](reordered, proposed["revision_id"])

    def test_rebuild_rejects_duplicate_proposals_and_conflicting_commit_order(self) -> None:
        api = _revision_api()
        first = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        proposal_event = next(
            event
            for event in load_events(self.workspace)
            if event["type"] == "improvement.revision_proposed"
            and event.get("payload", {}).get("revision_id") == first["revision_id"]
        )
        duplicate_workspace = self._event_only_workspace(with_owner=True)
        append_event(
            duplicate_workspace,
            event_type=proposal_event["type"],
            actor=proposal_event["actor"],
            scope=proposal_event["scope"],
            payload=proposal_event["payload"],
        )
        with self.assertRaises(api["AgentRevisionError"]):
            api["rebuild"](duplicate_workspace)

        second = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            SECOND_MANIFEST,
            actor="supervisor",
        )
        first_payload = self._revision_proposal_payload(first["revision_id"])
        second_payload = self._revision_proposal_payload(second["revision_id"])
        for revision, payload in ((second, second_payload), (first, first_payload)):
            append_event(
                self.workspace,
                event_type="approval.granted",
                actor={"type": "owner", "name": "local-owner"},
                scope={"surface": "agent-improvement", "revision_id": revision["revision_id"]},
                payload=self._approval_payload(
                    payload,
                    "apply_agent_revision",
                    decision_reason_code="accepted_as_bounded",
                ),
            )
            append_event(
                self.workspace,
                event_type="improvement.revision_applied",
                actor={"type": "owner", "name": "local-owner"},
                scope={"surface": "agent-improvement", "revision_id": revision["revision_id"]},
                payload=self._terminal_payload(payload, "apply_agent_revision"),
            )
        with self.assertRaises(api["AgentRevisionError"]):
            api["rebuild"](self.workspace)

    def test_atomic_projection_verifies_the_post_replace_hash(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        import ensemble_agent_revisions as service

        real_replace = service.os.replace
        corrupted = api["serialize"]({**BASE_MANIFEST, "summary": "Corrupted after replace."})

        def corrupt_after_replace(source, target):
            real_replace(source, target)
            Path(target).write_text(corrupted, encoding="utf-8")

        with patch.object(service.os, "replace", side_effect=corrupt_after_replace):
            with self.assertRaises(api["AgentRevisionError"]):
                api["apply"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="accepted_as_bounded",
                )
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), corrupted)
        api["rebuild"](self.workspace)
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](NEXT_MANIFEST))

    def test_apply_retry_materializes_committed_event_without_duplicate_terminal(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        import ensemble_agent_revisions as service

        with patch.object(service.os, "replace", side_effect=OSError("replace failed")):
            with self.assertRaises(api["AgentRevisionError"]):
                api["apply"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="accepted_as_bounded",
                )

        recovered = api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )
        self.assertEqual(recovered["status"], "applied")
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](NEXT_MANIFEST))
        self.assertEqual(
            sum(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace)),
            1,
        )

    def test_apply_retry_reuses_owner_grant_after_terminal_append_failure(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        import ensemble_agent_revisions as service

        real_append = service.append_event

        def fail_terminal_once(*args, **kwargs):
            if kwargs["event_type"] == "improvement.revision_applied":
                raise RuntimeError("terminal append failed")
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=fail_terminal_once):
            with self.assertRaisesRegex(RuntimeError, "terminal append failed"):
                api["apply"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="accepted_as_bounded",
                )
        api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )

        grants = [
            event
            for event in load_events(self.workspace)
            if event["type"] == "approval.granted"
            and event.get("payload", {}).get("action_type") == "apply_agent_revision"
        ]
        self.assertEqual(len(grants), 1)

    def test_apply_retry_rejects_a_reason_that_conflicts_with_the_committed_grant(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        import ensemble_agent_revisions as service

        real_append = service.append_event

        def fail_terminal_once(*args, **kwargs):
            if kwargs["event_type"] == "improvement.revision_applied":
                raise RuntimeError("terminal append failed")
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=fail_terminal_once):
            with self.assertRaisesRegex(RuntimeError, "terminal append failed"):
                api["apply"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="accepted_as_bounded",
                )

        with self.assertRaises(api["AgentRevisionError"]):
            api["apply"](
                self.workspace,
                proposed["revision_id"],
                reason_code="different_reason",
            )
        grants = [
            event
            for event in load_events(self.workspace)
            if event["type"] == "approval.granted"
            and event.get("payload", {}).get("action_type") == "apply_agent_revision"
        ]
        self.assertEqual(len(grants), 1)
        self.assertFalse(
            any(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace))
        )

    def test_apply_retry_after_commit_refuses_an_external_projection_mismatch(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        import ensemble_agent_revisions as service

        with patch.object(service.os, "replace", side_effect=OSError("replace failed")):
            with self.assertRaises(api["AgentRevisionError"]):
                api["apply"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="accepted_as_bounded",
                )
        external = api["serialize"]({**BASE_MANIFEST, "summary": "Externally modified."})
        self.skill_path.write_text(external, encoding="utf-8")

        with self.assertRaises(api["AgentRevisionError"]):
            api["apply"](
                self.workspace,
                proposed["revision_id"],
                reason_code="accepted_as_bounded",
            )
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), external)
        api["rebuild"](self.workspace)
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](NEXT_MANIFEST))

    def test_rollback_retry_recovers_projection_and_uses_rollback_action(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )
        import ensemble_agent_revisions as service

        with patch.object(service.os, "replace", side_effect=OSError("replace failed")):
            with self.assertRaises(api["AgentRevisionError"]):
                api["rollback"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="operator_revert",
                )

        recovered = api["rollback"](
            self.workspace,
            proposed["revision_id"],
            reason_code="operator_revert",
        )
        self.assertEqual(recovered["status"], "rolled_back")
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](BASE_MANIFEST))
        rollback_event = next(
            event
            for event in reversed(load_events(self.workspace))
            if event["type"] == "improvement.revision_rolled_back"
        )
        self.assertEqual(rollback_event["payload"]["action_type"], "rollback_agent_revision")
        self.assertEqual(
            sum(event["type"] == "improvement.revision_rolled_back" for event in load_events(self.workspace)),
            1,
        )

    def test_rollback_retry_reuses_request_and_grant_after_terminal_append_failure(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )
        import ensemble_agent_revisions as service

        real_append = service.append_event

        def fail_terminal_once(*args, **kwargs):
            if kwargs["event_type"] == "improvement.revision_rolled_back":
                raise RuntimeError("rollback terminal append failed")
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=fail_terminal_once):
            with self.assertRaisesRegex(RuntimeError, "rollback terminal append failed"):
                api["rollback"](
                    self.workspace,
                    proposed["revision_id"],
                    reason_code="operator_revert",
                )
        api["rollback"](
            self.workspace,
            proposed["revision_id"],
            reason_code="operator_revert",
        )

        rollback_events = [
            event
            for event in load_events(self.workspace)
            if event.get("payload", {}).get("action_type") == "rollback_agent_revision"
        ]
        self.assertEqual(
            [event["type"] for event in rollback_events],
            ["approval.requested", "approval.granted", "improvement.revision_rolled_back"],
        )

    def test_applied_revision_does_not_overwrite_external_drift_on_reentry(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        api["apply"](
            self.workspace,
            proposed["revision_id"],
            reason_code="accepted_as_bounded",
        )
        drifted = {**NEXT_MANIFEST, "summary": "Externally drifted after apply."}
        self.skill_path.write_text(api["serialize"](drifted), encoding="utf-8")

        with self.assertRaises(api["AgentRevisionError"]):
            api["apply"](
                self.workspace,
                proposed["revision_id"],
                reason_code="accepted_as_bounded",
            )

        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](drifted))

    def test_invalid_utf8_base_manifest_fails_at_the_service_boundary(self) -> None:
        api = _revision_api()
        self.skill_path.write_bytes(b"schema_v: 1\nsummary: \xff\n")
        baseline = len(load_events(self.workspace))

        with self.assertRaises(api["AgentRevisionError"]):
            api["propose"](
                self.workspace,
                self.candidate["candidate_id"],
                NEXT_MANIFEST,
                actor="supervisor",
            )
        self.assertEqual(len(load_events(self.workspace)), baseline)

    def test_base_manifest_parser_warnings_fail_before_revision_events(self) -> None:
        api = _revision_api()
        self.skill_path.write_text(
            api["serialize"](BASE_MANIFEST) + "this line is malformed\n",
            encoding="utf-8",
        )
        baseline = len(load_events(self.workspace))

        with self.assertRaises(api["AgentRevisionError"]):
            api["propose"](
                self.workspace,
                self.candidate["candidate_id"],
                NEXT_MANIFEST,
                actor="supervisor",
            )
        self.assertEqual(len(load_events(self.workspace)), baseline)

    def test_concurrent_apply_is_idempotent_and_conflicting_revisions_are_stale(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(
                pool.map(
                    lambda _: api["apply"](
                        self.workspace,
                        proposed["revision_id"],
                        reason_code="accepted_as_bounded",
                    ),
                    range(2),
                )
            )
        self.assertEqual([result["status"] for result in results], ["applied", "applied"])
        self.assertEqual(
            sum(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace)),
            1,
        )

        isolated = Path(tempfile.mkdtemp(dir=self.temp_dir.name))
        self.addCleanup(lambda: shutil.rmtree(isolated, ignore_errors=True))
        skill = isolated / ".agent" / "skills" / "context-curator.yaml"
        skill.parent.mkdir(parents=True, exist_ok=True)
        skill.write_text(api["serialize"](BASE_MANIFEST), encoding="utf-8")
        owner = isolated / ".notes" / "OWNER.json"
        owner.parent.mkdir(parents=True, exist_ok=True)
        owner.write_text((self.workspace / ".notes" / "OWNER.json").read_text(encoding="utf-8"), encoding="utf-8")
        event_file = isolated / ".notes" / "events" / "events.jsonl"
        event_file.parent.mkdir(parents=True, exist_ok=True)
        candidate_events = [
            event
            for event in load_events(self.workspace)
            if event.get("payload", {}).get("revision_id") is None
            and not event["type"].startswith("improvement.revision_")
        ]
        event_file.write_text(
            "".join(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n" for event in candidate_events),
            encoding="utf-8",
        )
        first = api["propose"](isolated, self.candidate["candidate_id"], NEXT_MANIFEST, actor="supervisor")
        second = api["propose"](isolated, self.candidate["candidate_id"], SECOND_MANIFEST, actor="supervisor")

        def apply_revision(revision_id: str):
            try:
                return api["apply"](isolated, revision_id, reason_code="accepted_as_bounded")
            except api["AgentRevisionError"] as exc:
                return exc

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(apply_revision, (first["revision_id"], second["revision_id"])))
        self.assertEqual(sum(isinstance(item, dict) and item["status"] == "applied" for item in outcomes), 1)
        self.assertEqual(sum(isinstance(item, api["AgentRevisionError"]) for item in outcomes), 1)
        self.assertIn(skill.read_text(encoding="utf-8"), {api["serialize"](NEXT_MANIFEST), api["serialize"](SECOND_MANIFEST)})

    def test_sequential_revisions_rebuild_and_rollback_as_an_active_stack(self) -> None:
        api = _revision_api()
        first = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )
        api["apply"](self.workspace, first["revision_id"], reason_code="accepted_as_bounded")
        second = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            SECOND_MANIFEST,
            actor="supervisor",
        )
        api["apply"](self.workspace, second["revision_id"], reason_code="accepted_as_bounded")
        api["rollback"](self.workspace, second["revision_id"], reason_code="operator_revert")

        api["rebuild"](self.workspace)
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](NEXT_MANIFEST))
        api["rollback"](self.workspace, first["revision_id"], reason_code="operator_revert")
        self.assertEqual(self.skill_path.read_text(encoding="utf-8"), api["serialize"](BASE_MANIFEST))

    def test_cli_revision_lifecycle_is_metadata_only_and_ascii_safe(self) -> None:
        api = _revision_api()
        revision_file = self.workspace / "revision-input.yaml"
        revision_file.write_text(api["serialize"](NEXT_MANIFEST), encoding="utf-8")
        before = self.skill_path.read_bytes()

        help_proc = self._run_cli("improvement", "--help")
        self.assertIn("revision-propose", help_proc.stdout)
        invalid = self._run_cli_unchecked(
            "improvement",
            "revision-apply",
            self.candidate["candidate_id"],
        )
        self.assertEqual(invalid.returncode, 1)
        self.assertEqual(self.skill_path.read_bytes(), before)

        proposed = json.loads(
            self._run_cli(
                "improvement",
                "revision-propose",
                self.candidate["candidate_id"],
                "--revision-file",
                str(revision_file),
            ).stdout
        )
        shown = json.loads(
            self._run_cli("improvement", "revision-show", proposed["revision_id"]).stdout
        )
        applied = json.loads(
            self._run_cli(
                "improvement",
                "revision-apply",
                proposed["revision_id"],
                "--reason-code",
                "accepted_as_bounded",
            ).stdout
        )
        rolled_back = json.loads(
            self._run_cli(
                "improvement",
                "revision-rollback",
                proposed["revision_id"],
                "--reason-code",
                "operator_revert",
            ).stdout
        )
        rebuilt = json.loads(self._run_cli("improvement", "revision-rebuild").stdout)

        self.assertEqual(shown["revision_id"], proposed["revision_id"])
        self.assertEqual(applied["status"], "applied")
        self.assertEqual(rolled_back["status"], "rolled_back")
        self.assertEqual(rebuilt["rebuilt"][0]["target_ref"], "skills/context-curator")
        combined = json.dumps(
            [proposed, shown, applied, rolled_back, rebuilt],
            ensure_ascii=True,
        )
        self.assertTrue(combined.isascii())
        self.assertNotIn("manifest", combined)
        self.assertNotIn(str(self.workspace.resolve()), combined)
        self.assertNotIn(str(revision_file), combined)

    def test_cli_concurrent_apply_serializes_to_one_terminal_event(self) -> None:
        api = _revision_api()
        proposed = api["propose"](
            self.workspace,
            self.candidate["candidate_id"],
            NEXT_MANIFEST,
            actor="supervisor",
        )

        def apply_in_process(_: int) -> subprocess.CompletedProcess[str]:
            return self._run_cli_unchecked(
                "improvement",
                "revision-apply",
                proposed["revision_id"],
                "--reason-code",
                "accepted_as_bounded",
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(apply_in_process, range(2)))

        self.assertEqual([result.returncode for result in results], [0, 0])
        self.assertEqual([json.loads(result.stdout)["status"] for result in results], ["applied", "applied"])
        self.assertEqual(
            sum(event["type"] == "improvement.revision_applied" for event in load_events(self.workspace)),
            1,
        )

    def test_cli_revision_failure_does_not_expose_private_input_or_paths(self) -> None:
        api = _revision_api()
        secret = "token=super-secret-value"
        private_path = r"C:\Users\alice\private.txt"
        unsafe_file = self.workspace / "private-revision-input.yaml"
        unsafe_manifest = api["serialize"](NEXT_MANIFEST).replace(
            f'summary: "{NEXT_MANIFEST["summary"]}"',
            f'summary: "{secret} {private_path}"',
        )
        unsafe_file.write_text(unsafe_manifest, encoding="utf-8")

        result = self._run_cli_unchecked(
            "improvement",
            "revision-propose",
            self.candidate["candidate_id"],
            "--revision-file",
            str(unsafe_file),
        )

        combined = result.stdout + result.stderr
        self.assertEqual(result.returncode, 1)
        self.assertIn("Agent skill revision failed", combined)
        self.assertNotIn(secret, combined)
        self.assertNotIn(private_path, combined)
        self.assertNotIn(str(self.workspace.resolve()), combined)
        self.assertNotIn(str(unsafe_file), combined)
        self.assertNotIn("Traceback", combined)

    def _approved_skill_patch_candidate(
        self,
        *,
        kind: str = "skill_patch",
        target_ref: str = "skills/context-curator",
        summary: str = "Revise context curator manifest.",
    ) -> dict:
        candidate = self._pending_skill_patch_candidate(kind=kind, target_ref=target_ref, summary=summary)
        return decide_improvement_candidate(
            self.workspace,
            candidate["candidate_id"],
            decision="approved",
            reviewer="owner",
            reason_code="accepted_as_bounded",
        )

    def _pending_skill_patch_candidate(
        self,
        *,
        kind: str = "skill_patch",
        target_ref: str = "skills/context-curator",
        summary: str = "Revise context curator manifest.",
    ) -> dict:
        closure = self._closure()
        return propose_improvement_candidate(
            self.workspace,
            CandidateProposal(
                closure_artifact_id=closure.artifact_id,
                kind=kind,
                target_ref=target_ref,
                summary=summary,
                change_summary=("Materialize the structured skill manifest.",),
                impact_areas=("skill_manifest",),
                actor="supervisor",
            ),
        )

    def _closure(self):
        episode_id = f"episode-revision-{len(load_events(self.workspace))}"
        task_event = append_event(
            self.workspace,
            event_type="task.created",
            actor={"type": "agent", "name": "test"},
            scope={"episode_id": episode_id, "run_id": f"run-{episode_id}"},
            payload={"episode_id": episode_id, "summary": "seed episode"},
        )
        append_event(
            self.workspace,
            event_type="validation.passed",
            actor={"type": "agent", "name": "verifier"},
            scope={"episode_id": episode_id, "iteration_id": f"iteration-{episode_id}"},
            payload={"episode_id": episode_id, "validator": "fixture", "source_event_id": task_event["event_id"]},
        )
        return close_episode(
            self.workspace,
            ClosureRequest(
                episode_id=episode_id,
                actor="supervisor",
                summary="Validated episode ready for a skill revision.",
                goal="Create a replayable skill revision",
                confidence="high",
            ),
        )

    def _write_matching_owner(self) -> None:
        owner_dir = self.workspace / ".notes"
        owner_dir.mkdir(parents=True, exist_ok=True)
        (owner_dir / "OWNER.json").write_text(
            json.dumps(
                {
                    "owner": {
                        "username": getpass.getuser(),
                        "uid": None,
                        "hostname": socket.gethostname(),
                    }
                },
                sort_keys=True,
            ),
            encoding="utf-8",
        )

    def _remove_owner(self) -> None:
        owner = self.workspace / ".notes" / "OWNER.json"
        if owner.exists():
            owner.unlink()

    def _revision_events(self) -> list[dict]:
        return [
            event
            for event in load_events(self.workspace)
            if event["type"]
            in {
                "improvement.revision_proposed",
                "improvement.revision_applied",
                "improvement.revision_rolled_back",
                "approval.requested",
                "approval.granted",
            }
            and (
                "revision_id" in event.get("payload", {})
                or event["type"].startswith("improvement.revision_")
            )
        ]

    def _snapshot(self) -> dict[str, bytes]:
        return {
            path.relative_to(self.workspace).as_posix(): path.read_bytes()
            for path in self.workspace.rglob("*")
            if path.is_file()
            and not path.relative_to(self.workspace).as_posix().startswith(".notes/events/")
            and not path.relative_to(self.workspace).as_posix().startswith(".notes/.notes/events/")
        }

    def _event_only_workspace(
        self,
        source_events: list[dict] | None = None,
        *,
        with_owner: bool = False,
    ) -> Path:
        clean = Path(tempfile.mkdtemp(dir=self.temp_dir.name))
        self.addCleanup(lambda: shutil.rmtree(clean, ignore_errors=True))
        event_file = clean / ".notes" / "events" / "events.jsonl"
        event_file.parent.mkdir(parents=True, exist_ok=True)
        events = source_events if source_events is not None else load_events(self.workspace)
        event_file.write_text(
            "".join(
                json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
                for event in events
            ),
            encoding="utf-8",
        )
        if with_owner:
            owner = clean / ".notes" / "OWNER.json"
            owner.write_text(
                (self.workspace / ".notes" / "OWNER.json").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
        return clean

    def _manifest_sha256(self, api: dict, manifest: dict) -> str:
        return hashlib.sha256(api["serialize"](manifest).encode("utf-8")).hexdigest()

    def _file_sha256(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _revision_proposal_payload(self, revision_id: str) -> dict:
        return next(
            deepcopy(event["payload"])
            for event in load_events(self.workspace)
            if event["type"] == "improvement.revision_proposed"
            and event.get("payload", {}).get("revision_id") == revision_id
        )

    def _approval_payload(
        self,
        revision: dict,
        action_type: str,
        *,
        decision_reason_code: str | None = None,
    ) -> dict:
        request_id = revision["approval_request_id"]
        if action_type == "rollback_agent_revision":
            request_id = f"approval-rollback-{revision['revision_id']}"
        payload = {
            "request_id": request_id,
            "revision_id": revision["revision_id"],
            "candidate_id": revision["candidate_id"],
            "candidate_version": revision["candidate_version"],
            "action_type": action_type,
            "target_ref": revision["target_ref"],
            "base_source_sha256": revision["base_source_sha256"],
            "base_canonical_sha256": revision["base_canonical_sha256"],
            "next_canonical_sha256": revision["next_canonical_sha256"],
        }
        if "candidate_proposal_sha256" in revision:
            payload["candidate_proposal_sha256"] = revision["candidate_proposal_sha256"]
        if decision_reason_code is not None:
            payload["decision"] = "approved"
            payload["decision_reason_code"] = decision_reason_code
        return payload

    def _terminal_payload(
        self,
        revision: dict,
        action_type: str,
        *,
        reason_code: str = "accepted_as_bounded",
    ) -> dict:
        payload = self._approval_payload(
            revision,
            action_type,
            decision_reason_code=reason_code,
        )
        payload.pop("decision")
        return payload

    def _rewrite_events(self, mutate) -> None:
        events = [mutate(deepcopy(event)) for event in load_events(self.workspace)]
        event_file = self.workspace / ".notes" / "events" / "events.jsonl"
        event_file.parent.mkdir(parents=True, exist_ok=True)
        event_file.write_text(
            "".join(
                json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
                for event in events
            ),
            encoding="utf-8",
        )

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        result = self._run_cli_unchecked(*args)
        result.check_returncode()
        return result

    def _run_cli_unchecked(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "ensemble.py"),
                "--workspace",
                str(self.workspace),
                *args,
            ],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )


if __name__ == "__main__":
    unittest.main()
