from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_episode_closure import ClosureRequest, close_episode
from ensemble_events import append_event, load_events


def _candidate_api():
    from ensemble_improvement_candidate_model import (
        CandidateProposal,
        ImprovementCandidateError,
    )
    from ensemble_improvement_candidates import (
        decide_improvement_candidate,
        list_improvement_candidates,
        propose_improvement_candidate,
        show_improvement_candidate,
    )

    return {
        "CandidateProposal": CandidateProposal,
        "ImprovementCandidateError": ImprovementCandidateError,
        "decide": decide_improvement_candidate,
        "list": list_improvement_candidates,
        "propose": propose_improvement_candidate,
        "show": show_improvement_candidate,
    }


class ImprovementCandidateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.workspace = Path(self.temp_dir.name)
        self.episode_id = "episode-candidate-001"
        append_event(
            self.workspace,
            event_type="task.created",
            actor={"type": "agent", "name": "test"},
            scope={"episode_id": self.episode_id, "run_id": "run-candidate-001"},
            payload={"episode_id": self.episode_id, "summary": "seed episode"},
        )
        append_event(
            self.workspace,
            event_type="validation.passed",
            actor={"type": "agent", "name": "verifier"},
            scope={"episode_id": self.episode_id, "iteration_id": "iteration-candidate-001"},
            payload={"episode_id": self.episode_id, "validator": "fixture"},
        )
        self.closure = close_episode(
            self.workspace,
            ClosureRequest(
                episode_id=self.episode_id,
                actor="supervisor",
                summary="Validated episode ready for improvement review.",
                goal="Create a replayable improvement candidate",
                confidence="high",
            ),
        )

    def proposal(self, **overrides):
        api = _candidate_api()
        values = {
            "closure_artifact_id": self.closure.artifact_id,
            "kind": "skill_patch",
            "target_ref": "skills/conitens-core",
            "summary": "Tighten the bounded handoff checklist.",
            "change_summary": ("Require an explicit next owner.",),
            "impact_areas": ("handoff_format",),
            "actor": "supervisor",
        }
        values.update(overrides)
        return api["CandidateProposal"](**values)

    def candidate_events(self):
        return [
            event
            for event in load_events(self.workspace)
            if event["type"] in {
                "improvement.candidate_proposed",
                "approval.requested",
                "approval.granted",
                "approval.denied",
            }
        ]

    def test_proposal_is_replayable_and_closure_linked(self) -> None:
        api = _candidate_api()

        result = api["propose"](self.workspace, self.proposal())

        self.assertEqual(result["artifact_kind"], "improvement_candidate")
        self.assertEqual(result["schema_v"], 1)
        self.assertEqual(result["candidate_version"], 1)
        self.assertEqual(result["kind"], "skill_patch")
        self.assertEqual(result["status"], "pending_review")
        self.assertTrue(result["review_requested"])
        self.assertEqual(result["risk"]["level"], "low")
        self.assertTrue(result["risk"]["requires_owner_approval"])
        self.assertEqual(result["provenance"]["source_artifact_id"], self.closure.artifact_id)
        self.assertEqual(result["provenance"]["source_closure_event_id"], self.closure.event_id)
        self.assertEqual(result["provenance"]["linked_refs"]["run_ids"], ["run-candidate-001"])
        self.assertEqual(
            result["provenance"]["linked_refs"]["iteration_ids"],
            ["iteration-candidate-001"],
        )

        events = self.candidate_events()
        self.assertEqual([event["type"] for event in events], [
            "improvement.candidate_proposed",
            "approval.requested",
        ])
        payload = events[0]["payload"]
        self.assertEqual(payload["candidate_id"], result["candidate_id"])
        self.assertEqual(payload["proposal_sha256"], result["proposal_sha256"])
        self.assertNotIn("closure_bundle", payload)
        self.assertNotIn("raw_transcript", json.dumps(payload))
        request_payload = events[1]["payload"]
        self.assertEqual(request_payload["candidate_id"], result["candidate_id"])
        self.assertEqual(request_payload["request_id"], result["approval_request_id"])
        self.assertNotIn("change_summary", request_payload)
        self.assertNotIn("summary", request_payload)
        self.assertNotIn("closure_bundle", request_payload)
        self.assertNotIn(str(self.workspace.resolve()), json.dumps(request_payload))

    def test_event_order_and_append_failures_are_fail_closed(self) -> None:
        api = _candidate_api()
        import ensemble_improvement_candidates as service

        real_append = service.append_event
        observed: list[str] = []

        def recording_append(*args, **kwargs):
            observed.append(kwargs["event_type"])
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=recording_append):
            api["propose"](self.workspace, self.proposal())
        self.assertEqual(observed, ["improvement.candidate_proposed", "approval.requested"])

        second_workspace = Path(tempfile.mkdtemp(dir=self.temp_dir.name))
        self._copy_closure_events(second_workspace)
        proposal = self.proposal()
        before_files = {
            path.relative_to(second_workspace).as_posix(): path.read_bytes()
            for path in second_workspace.rglob("*")
            if path.is_file()
        }
        with patch.object(service, "append_event", side_effect=RuntimeError("first append failed")):
            with self.assertRaisesRegex(RuntimeError, "first append failed"):
                api["propose"](second_workspace, proposal)
        self.assertEqual(api["list"](second_workspace), [])
        after_files = {
            path.relative_to(second_workspace).as_posix(): path.read_bytes()
            for path in second_workspace.rglob("*")
            if path.is_file()
        }
        self.assertEqual(after_files, before_files)
        self.assertFalse((second_workspace / ".agent").exists())

    def test_retry_repairs_missing_approval_without_duplicate_candidate(self) -> None:
        api = _candidate_api()
        import ensemble_improvement_candidates as service

        real_append = service.append_event
        calls = 0

        def fail_second_append(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("approval append failed")
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=fail_second_append):
            with self.assertRaisesRegex(RuntimeError, "approval append failed"):
                api["propose"](self.workspace, self.proposal())

        partial = api["list"](self.workspace)
        self.assertEqual(len(partial), 1)
        self.assertFalse(partial[0]["review_requested"])
        self.assertEqual(partial[0]["status"], "pending_review")
        self.assertNotEqual(partial[0]["status"], "applied")
        candidate_id = partial[0]["candidate_id"]

        repaired = api["propose"](self.workspace, self.proposal())

        self.assertEqual(repaired["candidate_id"], candidate_id)
        self.assertTrue(repaired["review_requested"])
        events = self.candidate_events()
        self.assertEqual(sum(event["type"] == "improvement.candidate_proposed" for event in events), 1)
        self.assertEqual(sum(event["type"] == "approval.requested" for event in events), 1)

    def test_exact_retry_is_idempotent_and_changed_proposal_increments_version(self) -> None:
        api = _candidate_api()
        first = api["propose"](self.workspace, self.proposal())
        event_count = len(self.candidate_events())

        exact_retry = api["propose"](self.workspace, self.proposal())
        changed = api["propose"](
            self.workspace,
            self.proposal(summary="Tighten the bounded handoff checklist and validation wording."),
        )

        self.assertEqual(exact_retry["candidate_id"], first["candidate_id"])
        self.assertEqual(len(self.candidate_events()), event_count + 2)
        self.assertEqual(changed["candidate_version"], 2)
        self.assertNotEqual(changed["proposal_sha256"], first["proposal_sha256"])

    def test_malformed_candidate_event_cannot_poison_next_version(self) -> None:
        api = _candidate_api()
        first = api["propose"](self.workspace, self.proposal())
        source_event = next(
            event
            for event in self.candidate_events()
            if event["type"] == "improvement.candidate_proposed"
        )
        malformed = deepcopy(source_event["payload"])
        malformed["candidate_version"] = 999
        malformed["candidate_id"] = f"candidate-{malformed['candidate_key']}-v999"
        malformed["approval_request_id"] = f"approval-{malformed['candidate_id']}"
        malformed["proposal_sha256"] = "0" * 64
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement", "candidate_id": malformed["candidate_id"]},
            payload=malformed,
        )

        changed = api["propose"](
            self.workspace,
            self.proposal(summary="A valid second proposal after malformed replay input."),
        )

        self.assertEqual(first["candidate_version"], 1)
        self.assertEqual(changed["candidate_version"], 2)

    def test_non_string_candidate_fields_cannot_poison_next_version(self) -> None:
        api = _candidate_api()
        first_proposal = self.proposal(
            target_ref="123",
            summary="A valid first proposal before malformed replay input.",
        )
        first = api["propose"](self.workspace, first_proposal)
        source_event = next(
            event
            for event in self.candidate_events()
            if event["type"] == "improvement.candidate_proposed"
            and event["payload"]["candidate_id"] == first["candidate_id"]
        )
        malformed_proposal = self.proposal(target_ref="123", summary="456")
        malformed = deepcopy(source_event["payload"])
        malformed["candidate_version"] = 2
        malformed["candidate_id"] = f"candidate-{malformed['candidate_key']}-v2"
        malformed["approval_request_id"] = f"approval-{malformed['candidate_id']}"
        malformed["target_ref"] = 123
        malformed["summary"] = 456
        malformed["proposal_sha256"] = malformed_proposal.proposal_sha256()
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement", "candidate_id": malformed["candidate_id"]},
            payload=malformed,
        )

        with self.assertRaises(api["ImprovementCandidateError"]):
            api["show"](self.workspace, malformed["candidate_id"])
        self.assertNotIn(
            malformed["candidate_id"],
            {row["candidate_id"] for row in api["list"](self.workspace)},
        )

        changed = api["propose"](
            self.workspace,
            self.proposal(
                target_ref="123",
                summary="A valid second proposal after non-string replay input.",
            ),
        )

        self.assertEqual(changed["candidate_version"], 2)

    def test_risk_classifier_is_deterministic_and_protected_impacts_are_high(self) -> None:
        api = _candidate_api()

        topology = api["propose"](
            self.workspace,
            self.proposal(kind="agent_topology_revision", target_ref="agents/reviewer-topology"),
        )
        workflow = api["propose"](
            self.workspace,
            self.proposal(kind="workflow_revision", target_ref="workflows/validation"),
        )
        protected = api["propose"](
            self.workspace,
            self.proposal(
                target_ref="skills/approval-control",
                impact_areas=("approval_policy",),
            ),
        )

        self.assertEqual(topology["risk"]["level"], "high")
        self.assertIn(workflow["risk"]["level"], {"medium", "high"})
        self.assertEqual(protected["risk"]["level"], "high")
        self.assertTrue(any("protected" in code for code in protected["risk"]["reason_codes"]))
        for candidate in (topology, workflow, protected):
            self.assertEqual(candidate["status"], "pending_review")
            self.assertNotEqual(candidate["status"], "applied")

    def test_unsupported_kind_and_unbounded_proposals_fail_before_append(self) -> None:
        api = _candidate_api()
        baseline = len(load_events(self.workspace))
        cases = (
            {"kind": "persona_rewrite"},
            {"closure_artifact_id": "c" * 201},
            {"summary": "s" * 501},
            {"target_ref": "t" * 201},
            {"change_summary": ("c" * 301,)},
            {"impact_areas": ("i" * 81,)},
            {"actor": "a" * 129},
            {"change_summary": tuple(f"change-{index}" for index in range(21))},
            {"impact_areas": tuple(f"area_{index}" for index in range(21))},
            {"summary": 123},
            {"change_summary": (123,)},
        )

        for overrides in cases:
            with self.subTest(overrides=overrides):
                with self.assertRaises(api["ImprovementCandidateError"]):
                    api["propose"](self.workspace, self.proposal(**overrides))
                self.assertEqual(len(load_events(self.workspace)), baseline)

    def test_malformed_exact_retry_event_cannot_trigger_approval_repair(self) -> None:
        api = _candidate_api()
        proposal = self.proposal()
        api["propose"](self.workspace, proposal)
        valid_payload = deepcopy(
            next(
                event["payload"]
                for event in self.candidate_events()
                if event["type"] == "improvement.candidate_proposed"
            )
        )
        second_workspace = Path(tempfile.mkdtemp(dir=self.temp_dir.name))
        self._copy_closure_events(second_workspace)
        valid_payload["candidate_id"] = "candidate-malformed-v99"
        valid_payload["candidate_version"] = 99
        valid_payload["approval_request_id"] = "approval-candidate-malformed-v99"
        append_event(
            second_workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"candidate_id": valid_payload["candidate_id"]},
            payload=valid_payload,
        )
        baseline = len(load_events(second_workspace))

        with self.assertRaises(api["ImprovementCandidateError"]):
            api["propose"](second_workspace, proposal)

        self.assertEqual(len(load_events(second_workspace)), baseline)
        candidate_events = [
            event
            for event in load_events(second_workspace)
            if event["type"] == "improvement.candidate_proposed"
        ]
        approval_events = [
            event
            for event in load_events(second_workspace)
            if event["type"] == "approval.requested"
        ]
        self.assertEqual(len(candidate_events), 1)
        self.assertEqual(approval_events, [])

    def test_proposal_digest_preserves_structured_field_boundaries(self) -> None:
        api = _candidate_api()
        first_proposal = self.proposal(
            summary="Line A\nLine B",
            change_summary=("Line C",),
        )
        second_proposal = self.proposal(
            summary="Line A",
            change_summary=("Line B", "Line C"),
        )

        first = api["propose"](self.workspace, first_proposal)
        second = api["propose"](self.workspace, second_proposal)

        self.assertNotEqual(first["proposal_sha256"], second["proposal_sha256"])
        self.assertEqual(second["candidate_version"], 2)

    def test_protected_markers_upgrade_skill_patch_to_high_risk(self) -> None:
        api = _candidate_api()

        shell_access = api["propose"](
            self.workspace,
            self.proposal(
                target_ref="skills/execution-policy",
                summary="Revise shell access policy.",
                impact_areas=("execution_policy",),
            ),
        )
        runtime_default = api["propose"](
            self.workspace,
            self.proposal(
                target_ref="runtime/default-selection",
                summary="Revise the default runtime selection policy.",
                impact_areas=("runtime_default",),
            ),
        )

        self.assertEqual(shell_access["risk"]["level"], "high")
        self.assertEqual(runtime_default["risk"]["level"], "high")
        self.assertTrue(any("protected" in code for code in shell_access["risk"]["reason_codes"]))

    def test_decisions_are_event_derived_metadata_only_and_terminal(self) -> None:
        api = _candidate_api()
        approved_candidate = api["propose"](self.workspace, self.proposal())

        approved = api["decide"](
            self.workspace,
            approved_candidate["candidate_id"],
            decision="approved",
            reviewer="owner",
            reason_code="accepted_as_bounded",
        )

        self.assertEqual(approved["status"], "approved")
        decision_event = self.candidate_events()[-1]
        self.assertEqual(decision_event["type"], "approval.granted")
        self.assertEqual(decision_event["payload"]["decision_reason_code"], "accepted_as_bounded")
        self.assertNotIn("reviewer_note", decision_event["payload"])
        self.assertNotIn("action_payload", decision_event["payload"])
        for second_decision in ("approved", "rejected"):
            with self.assertRaisesRegex(api["ImprovementCandidateError"], "already decided"):
                api["decide"](
                    self.workspace,
                    approved_candidate["candidate_id"],
                    decision=second_decision,
                    reviewer="owner",
                    reason_code="duplicate_or_conflicting",
                )

        rejected_candidate = api["propose"](
            self.workspace,
            self.proposal(summary="A distinct proposal for rejection."),
        )
        rejected = api["decide"](
            self.workspace,
            rejected_candidate["candidate_id"],
            decision="rejected",
            reviewer="owner",
            reason_code="insufficient_evidence",
        )
        self.assertEqual(rejected["status"], "rejected")
        self.assertEqual(self.candidate_events()[-1]["type"], "approval.denied")

        with self.assertRaisesRegex(api["ImprovementCandidateError"], "not found"):
            api["decide"](
                self.workspace,
                "candidate-missing-v1",
                decision="approved",
                reviewer="owner",
                reason_code="unknown",
            )

    def test_decision_append_failure_keeps_candidate_pending(self) -> None:
        api = _candidate_api()
        import ensemble_improvement_candidates as service

        proposed = api["propose"](self.workspace, self.proposal())
        before = len(self.candidate_events())
        with patch.object(service, "append_event", side_effect=RuntimeError("decision append failed")):
            with self.assertRaisesRegex(RuntimeError, "decision append failed"):
                api["decide"](
                    self.workspace,
                    proposed["candidate_id"],
                    decision="approved",
                    reviewer="owner",
                    reason_code="accepted_as_bounded",
                )

        self.assertEqual(len(self.candidate_events()), before)
        self.assertEqual(api["show"](self.workspace, proposed["candidate_id"])["status"], "pending_review")

    def test_unrelated_or_wrong_action_approval_events_do_not_decide_candidate(self) -> None:
        api = _candidate_api()
        proposed = api["propose"](self.workspace, self.proposal())
        candidate_id = proposed["candidate_id"]
        request_id = proposed["approval_request_id"]

        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "reviewer", "name": "owner"},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={
                "candidate_id": candidate_id,
                "request_id": "approval-unrelated",
                "action_type": "review_improvement_candidate",
                "decision": "approved",
            },
        )
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "reviewer", "name": "owner"},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={
                "candidate_id": candidate_id,
                "request_id": request_id,
                "candidate_version": proposed["candidate_version"],
                "action_type": "review_improvement_candidate",
                "decision": "rejected",
                "decision_reason_code": "mismatched_event_type",
            },
        )
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "reviewer", "name": "owner"},
            scope={"candidate_id": candidate_id},
            payload={
                "candidate_id": candidate_id,
                "request_id": request_id,
                "action_type": "shell_execution",
                "decision": "approved",
            },
        )
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "agent", "name": "owner"},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={
                "candidate_id": candidate_id,
                "request_id": request_id,
                "candidate_version": proposed["candidate_version"],
                "action_type": "review_improvement_candidate",
                "decision": "approved",
                "decision_reason_code": "wrong_actor_type",
            },
        )

        self.assertEqual(api["show"](self.workspace, candidate_id)["status"], "pending_review")

    def test_approval_events_before_candidate_proposal_cannot_predecide_it(self) -> None:
        api = _candidate_api()
        proposal = self.proposal()
        candidate_id = f"candidate-{proposal.candidate_key()}-v1"
        request_id = f"approval-{candidate_id}"
        common = {
            "candidate_id": candidate_id,
            "request_id": request_id,
            "candidate_version": 1,
            "action_type": "review_improvement_candidate",
        }
        append_event(
            self.workspace,
            event_type="approval.requested",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={
                **common,
                "kind": proposal.kind,
                "risk_level": proposal.risk().level,
                "source_artifact_id": proposal.closure_artifact_id,
            },
        )
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "reviewer", "name": "owner"},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={
                **common,
                "decision": "approved",
                "decision_reason_code": "preexisting_forgery",
            },
        )

        proposed = api["propose"](self.workspace, proposal)

        self.assertTrue(proposed["review_requested"])
        self.assertEqual(proposed["status"], "pending_review")

    def test_conflicting_terminal_events_fail_closed_during_replay(self) -> None:
        api = _candidate_api()
        proposed = api["propose"](self.workspace, self.proposal())
        candidate_id = proposed["candidate_id"]
        request_id = proposed["approval_request_id"]
        common = {
            "candidate_id": candidate_id,
            "request_id": request_id,
            "candidate_version": proposed["candidate_version"],
            "action_type": "review_improvement_candidate",
        }
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "reviewer", "name": "owner"},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={**common, "decision": "approved", "decision_reason_code": "accepted"},
        )
        append_event(
            self.workspace,
            event_type="approval.denied",
            actor={"type": "reviewer", "name": "owner"},
            scope={"surface": "agent-improvement", "candidate_id": candidate_id},
            payload={**common, "decision": "rejected", "decision_reason_code": "conflict"},
        )

        with self.assertRaisesRegex(api["ImprovementCandidateError"], "conflicting|multiple"):
            api["show"](self.workspace, candidate_id)

    def test_decision_requires_recorded_approval_request(self) -> None:
        api = _candidate_api()
        import ensemble_improvement_candidates as service

        real_append = service.append_event
        calls = 0

        def fail_second_append(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("approval append failed")
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=fail_second_append):
            with self.assertRaises(RuntimeError):
                api["propose"](self.workspace, self.proposal())
        candidate_id = api["list"](self.workspace)[0]["candidate_id"]

        with self.assertRaisesRegex(api["ImprovementCandidateError"], "approval request"):
            api["decide"](
                self.workspace,
                candidate_id,
                decision="approved",
                reviewer="owner",
                reason_code="must_fail_closed",
            )

    def test_replay_requires_candidate_scope_and_exact_request_metadata(self) -> None:
        api = _candidate_api()
        import ensemble_improvement_candidates as service

        real_append = service.append_event
        calls = 0

        def fail_second_append(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("approval append failed")
            return real_append(*args, **kwargs)

        with patch.object(service, "append_event", side_effect=fail_second_append):
            with self.assertRaises(RuntimeError):
                api["propose"](self.workspace, self.proposal())

        partial = api["list"](self.workspace)[0]
        detail = api["show"](self.workspace, partial["candidate_id"])
        request_payload = {
            "request_id": detail["approval_request_id"],
            "candidate_id": detail["candidate_id"],
            "candidate_version": detail["candidate_version"],
            "kind": detail["kind"],
            "risk_level": detail["risk"]["level"],
            "action_type": "review_improvement_candidate",
            "source_artifact_id": detail["provenance"]["source_artifact_id"],
        }
        append_event(
            self.workspace,
            event_type="approval.requested",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement", "candidate_id": detail["candidate_id"]},
            payload={**request_payload, "kind": "workflow_revision", "private_note": "must not qualify"},
        )
        append_event(
            self.workspace,
            event_type="approval.requested",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "other", "candidate_id": detail["candidate_id"]},
            payload=request_payload,
        )
        append_event(
            self.workspace,
            event_type="approval.requested",
            actor={"type": "reviewer", "name": "owner"},
            scope={"surface": "agent-improvement", "candidate_id": detail["candidate_id"]},
            payload=request_payload,
        )
        self.assertFalse(api["show"](self.workspace, detail["candidate_id"])["review_requested"])

        append_event(
            self.workspace,
            event_type="approval.requested",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement", "candidate_id": detail["candidate_id"]},
            payload=request_payload,
        )
        append_event(
            self.workspace,
            event_type="approval.granted",
            actor={"type": "reviewer", "name": "owner"},
            scope={"surface": "other", "candidate_id": detail["candidate_id"]},
            payload={
                "request_id": detail["approval_request_id"],
                "candidate_id": detail["candidate_id"],
                "candidate_version": detail["candidate_version"],
                "action_type": "review_improvement_candidate",
                "decision": "approved",
                "decision_reason_code": "wrong_scope",
            },
        )
        replayed = api["show"](self.workspace, detail["candidate_id"])
        self.assertTrue(replayed["review_requested"])
        self.assertEqual(replayed["status"], "pending_review")

    def test_private_raw_paths_and_secrets_are_rejected_before_append(self) -> None:
        api = _candidate_api()
        cases = (
            {"summary": "contains a raw transcript"},
            {"summary": "provider prompt content"},
            {"summary": "provider completion content"},
            {"change_summary": ("captured stdout output",)},
            {"change_summary": ("captured stderr output",)},
            {"summary": "agent scratchpad excerpt"},
            {"summary": "chain-of-thought excerpt"},
            {"target_ref": r"C:\\Users\\alice\\secret.txt"},
            {"summary": r"read D:\\private\\file.txt"},
            {"target_ref": r"\\\\server\\private\\file.txt"},
            {"summary": r"read \\\\server\\private\\file.txt"},
            {"summary": "read /home/alice/private.txt"},
            {"summary": "read /opt/private/file.txt"},
            {"summary": "token=super-secret-value"},
            {"summary": "api_key=super-secret-value"},
            {"summary": "Bearer abc.def.ghi"},
            {"summary": "sk-live-secret-value"},
            {"summary": "ghp_secretvalue123"},
            {"actor": r"C:\\Users\\alice"},
        )
        baseline = len(load_events(self.workspace))

        for overrides in cases:
            with self.subTest(overrides=overrides):
                with self.assertRaises(api["ImprovementCandidateError"]):
                    api["propose"](self.workspace, self.proposal(**overrides))
                self.assertEqual(len(load_events(self.workspace)), baseline)

    def test_unsafe_linked_ids_are_not_copied_from_closure_sources(self) -> None:
        api = _candidate_api()
        unsafe_source = append_event(
            self.workspace,
            event_type="task.status_changed",
            actor={"type": "agent", "name": "test"},
            scope={
                "episode_id": self.episode_id,
                "run_id": r"D:\\private\\run.json",
                "room_id": "/opt/private/room.json",
            },
            payload={"episode_id": self.episode_id, "status": "review"},
        )
        replacement_closure = append_event(
            self.workspace,
            event_type="task.artifact_added",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement"},
            payload={
                "artifact_kind": "episode_closure_bundle",
                "artifact_id": self.closure.artifact_id,
                "source_episode_ref": "episode-sha256:safe",
                "source_event_ids": [unsafe_source["event_id"]],
                "artifact_sha256": "a" * 64,
                "digest_sha256": "b" * 64,
            },
        )

        proposed = api["propose"](
            self.workspace,
            self.proposal(summary="Proposal with filtered closure links."),
        )

        self.assertEqual(proposed["provenance"]["source_closure_event_id"], replacement_closure["event_id"])
        self.assertEqual(proposed["provenance"]["linked_refs"]["run_ids"], [])
        self.assertEqual(proposed["provenance"]["linked_refs"]["room_ids"], [])
        serialized = json.dumps(proposed, ensure_ascii=False)
        self.assertNotIn("D:\\private", serialized)
        self.assertNotIn("/opt/private", serialized)

    def test_unsafe_closure_provenance_is_rejected_before_candidate_append(self) -> None:
        api = _candidate_api()
        append_event(
            self.workspace,
            event_type="task.artifact_added",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement"},
            payload={
                "artifact_kind": "episode_closure_bundle",
                "artifact_id": self.closure.artifact_id,
                "source_episode_ref": r"D:\\private\\episode.json",
                "source_event_ids": [],
                "artifact_sha256": "a" * 64,
                "digest_sha256": "b" * 64,
            },
        )
        baseline = len(self.candidate_events())

        with self.assertRaises(api["ImprovementCandidateError"]):
            api["propose"](
                self.workspace,
                self.proposal(summary="Candidate must reject unsafe closure provenance."),
            )

        self.assertEqual(len(self.candidate_events()), baseline)

    def test_private_reviewer_and_reason_code_are_rejected_before_decision_append(self) -> None:
        api = _candidate_api()
        proposed = api["propose"](self.workspace, self.proposal())
        baseline = len(load_events(self.workspace))

        cases = (
            {"reviewer": r"C:\\Users\\alice", "reason_code": "accepted"},
            {"reviewer": "o" * 129, "reason_code": "accepted"},
            {"reviewer": "owner", "reason_code": "token=private-value"},
            {"reviewer": "owner", "reason_code": "provider_completion"},
            {"reviewer": "owner", "reason_code": "r" * 81},
            {"reviewer": "owner", "reason_code": "this is a free form note"},
        )
        for values in cases:
            with self.subTest(values=values):
                with self.assertRaises(api["ImprovementCandidateError"]):
                    api["decide"](
                        self.workspace,
                        proposed["candidate_id"],
                        decision="approved",
                        reviewer=values["reviewer"],
                        reason_code=values["reason_code"],
                    )
                self.assertEqual(len(load_events(self.workspace)), baseline)

    def test_public_list_is_l0_and_show_is_bounded_l2(self) -> None:
        api = _candidate_api()
        proposed = api["propose"](self.workspace, self.proposal())

        row = api["list"](self.workspace)[0]
        detail = api["show"](self.workspace, proposed["candidate_id"])

        self.assertNotIn("change_summary", row)
        self.assertNotIn("provenance", row)
        self.assertNotIn("raw_access", row)
        self.assertEqual(detail["change_summary"], ["Require an explicit next owner."])
        self.assertIn("provenance", detail)
        self.assertNotIn("raw_access", detail)
        serialized = json.dumps(detail, ensure_ascii=False)
        self.assertNotIn(str(self.workspace.resolve()), serialized)
        self.assertNotIn("closure_bundle", serialized)

    def test_public_read_drops_unknown_nested_fields_and_rejects_private_candidate_text(self) -> None:
        api = _candidate_api()
        proposed = api["propose"](self.workspace, self.proposal())
        source_event = next(
            event
            for event in self.candidate_events()
            if event["type"] == "improvement.candidate_proposed"
            and event["payload"]["candidate_id"] == proposed["candidate_id"]
        )

        manual_proposal = self.proposal(summary="A second safe proposal for public filtering.")
        extra_fields = deepcopy(source_event["payload"])
        extra_fields["candidate_id"] = f"candidate-{manual_proposal.candidate_key()}-v2"
        extra_fields["candidate_key"] = manual_proposal.candidate_key()
        extra_fields["candidate_version"] = 2
        extra_fields["approval_request_id"] = f"approval-{extra_fields['candidate_id']}"
        extra_fields["summary"] = manual_proposal.summary
        extra_fields["proposal_sha256"] = manual_proposal.proposal_sha256()
        extra_fields["risk"]["private_blob"] = "should never render"
        extra_fields["provenance"]["private_blob"] = "should never render"
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"candidate_id": extra_fields["candidate_id"]},
            payload=extra_fields,
        )
        detail = api["show"](self.workspace, extra_fields["candidate_id"])
        self.assertNotIn("private_blob", json.dumps(detail))

        private_text = deepcopy(source_event["payload"])
        private_text["candidate_id"] = f"candidate-{manual_proposal.candidate_key()}-v3"
        private_text["candidate_key"] = manual_proposal.candidate_key()
        private_text["candidate_version"] = 3
        private_text["approval_request_id"] = f"approval-{private_text['candidate_id']}"
        private_text["summary"] = "copied raw transcript excerpt"
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"candidate_id": private_text["candidate_id"]},
            payload=private_text,
        )

        with self.assertRaises(api["ImprovementCandidateError"]):
            api["show"](self.workspace, private_text["candidate_id"])
        self.assertNotIn(
            "raw transcript",
            json.dumps(api["list"](self.workspace), ensure_ascii=False),
        )

        private_change = deepcopy(extra_fields)
        private_change["candidate_id"] = f"candidate-{manual_proposal.candidate_key()}-v4"
        private_change["candidate_version"] = 4
        private_change["approval_request_id"] = f"approval-{private_change['candidate_id']}"
        private_change["change_summary"] = ["copied provider completion"]
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"candidate_id": private_change["candidate_id"]},
            payload=private_change,
        )
        with self.assertRaises(api["ImprovementCandidateError"]):
            api["show"](self.workspace, private_change["candidate_id"])

        unsafe_provenance = deepcopy(extra_fields)
        unsafe_provenance["candidate_id"] = f"candidate-{manual_proposal.candidate_key()}-v5"
        unsafe_provenance["candidate_version"] = 5
        unsafe_provenance["approval_request_id"] = f"approval-{unsafe_provenance['candidate_id']}"
        unsafe_provenance["provenance"]["source_episode_ref"] = r"D:\\private\\episode.json"
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"candidate_id": unsafe_provenance["candidate_id"]},
            payload=unsafe_provenance,
        )
        with self.assertRaises(api["ImprovementCandidateError"]):
            api["show"](self.workspace, unsafe_provenance["candidate_id"])

        downgraded_risk = deepcopy(extra_fields)
        downgraded_risk["candidate_id"] = f"candidate-{manual_proposal.candidate_key()}-v6"
        downgraded_risk["candidate_version"] = 6
        downgraded_risk["approval_request_id"] = f"approval-{downgraded_risk['candidate_id']}"
        downgraded_risk["risk"]["requires_owner_approval"] = False
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"candidate_id": downgraded_risk["candidate_id"]},
            payload=downgraded_risk,
        )
        with self.assertRaises(api["ImprovementCandidateError"]):
            api["show"](self.workspace, downgraded_risk["candidate_id"])

        bad_digest = deepcopy(extra_fields)
        bad_digest["candidate_id"] = f"candidate-{manual_proposal.candidate_key()}-v7"
        bad_digest["candidate_version"] = 7
        bad_digest["approval_request_id"] = f"approval-{bad_digest['candidate_id']}"
        bad_digest["proposal_sha256"] = "0" * 64
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"candidate_id": bad_digest["candidate_id"]},
            payload=bad_digest,
        )
        with self.assertRaises(api["ImprovementCandidateError"]):
            api["show"](self.workspace, bad_digest["candidate_id"])

        forged_provenance = deepcopy(extra_fields)
        forged_provenance["candidate_id"] = f"candidate-{manual_proposal.candidate_key()}-v8"
        forged_provenance["candidate_version"] = 8
        forged_provenance["approval_request_id"] = f"approval-{forged_provenance['candidate_id']}"
        forged_provenance["provenance"]["source_episode_ref"] = "episode-forged-provenance"
        append_event(
            self.workspace,
            event_type="improvement.candidate_proposed",
            actor={"type": "agent", "name": "supervisor"},
            scope={"surface": "agent-improvement", "candidate_id": forged_provenance["candidate_id"]},
            payload=forged_provenance,
        )
        with self.assertRaises(api["ImprovementCandidateError"]):
            api["show"](self.workspace, forged_provenance["candidate_id"])

    def test_cli_candidate_create_list_show_and_decide(self) -> None:
        create = self._run_cli(
            "improvement",
            "candidate-create",
            self.closure.artifact_id,
            "--kind",
            "skill_patch",
            "--target-ref",
            "skills/conitens-core",
            "--summary",
            "Tighten the bounded handoff checklist.",
            "--change",
            "Require an explicit next owner.",
            "--impact-area",
            "handoff_format",
        )
        created = json.loads(create.stdout)
        candidate_id = created["candidate_id"]

        listed = json.loads(self._run_cli("improvement", "candidate-list").stdout)
        shown = json.loads(
            self._run_cli("improvement", "candidate-show", candidate_id).stdout
        )
        decided = json.loads(
            self._run_cli(
                "improvement",
                "candidate-decide",
                candidate_id,
                "--decision",
                "approved",
                "--reviewer",
                "owner",
                "--reason-code",
                "accepted_as_bounded",
            ).stdout
        )

        self.assertEqual(listed[0]["candidate_id"], candidate_id)
        self.assertEqual(shown["candidate_id"], candidate_id)
        self.assertEqual(decided["status"], "approved")
        combined = create.stdout + json.dumps(listed) + json.dumps(shown) + json.dumps(decided)
        self.assertNotIn(str(self.workspace.resolve()), combined)

    def test_cli_help_and_invalid_decision_are_fail_closed(self) -> None:
        help_proc = self._run_cli("improvement", "--help")
        self.assertIn("candidate-create", help_proc.stdout)
        baseline = len(load_events(self.workspace))

        invalid = self._run_cli_unchecked(
            "improvement",
            "candidate-decide",
            "candidate-missing-v1",
            "--decision",
            "invalid",
            "--reviewer",
            "owner",
            "--reason-code",
            "invalid_decision",
        )

        self.assertEqual(invalid.returncode, 2)
        self.assertEqual(len(load_events(self.workspace)), baseline)

        unsafe_candidate_id = r"D:\\private\\candidate.json"
        invalid_show = self._run_cli_unchecked(
            "improvement",
            "candidate-show",
            unsafe_candidate_id,
        )
        self.assertEqual(invalid_show.returncode, 1)
        self.assertNotIn(unsafe_candidate_id, invalid_show.stdout + invalid_show.stderr)

        api = _candidate_api()
        for invalid_limit in (0, -1, 101):
            with self.subTest(invalid_limit=invalid_limit):
                with self.assertRaises(api["ImprovementCandidateError"]):
                    api["list"](self.workspace, limit=invalid_limit)

    def test_generated_python_event_dictionary_contains_candidate_event(self) -> None:
        from ensemble_allowed_events import ALLOWED_EVENT_TYPES

        self.assertIn("improvement.candidate_proposed", ALLOWED_EVENT_TYPES)

    def _copy_closure_events(self, workspace: Path) -> None:
        for event in load_events(self.workspace):
            if event["type"] in {
                "improvement.candidate_proposed",
                "approval.requested",
                "approval.granted",
                "approval.denied",
            }:
                continue
            append_event(
                workspace,
                event_type=event["type"],
                actor=event.get("actor"),
                scope=event.get("scope"),
                severity=str(event.get("severity") or "info"),
                payload=event.get("payload"),
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
