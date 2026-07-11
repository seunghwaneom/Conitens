from __future__ import annotations

import getpass
import json
import multiprocessing
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from hashlib import sha256
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_episode_closure import ClosureRequest, close_episode
from ensemble_episode_artifacts import json_hash, render_closure_digest
from ensemble_events import append_event, load_events
from ensemble_improvement_candidate_model import CandidateProposal
from ensemble_improvement_candidates import decide_improvement_candidate, propose_improvement_candidate
from ensemble_improvement_effects import (
    EffectObservationError,
    EffectObservationRequest,
    list_improvement_effects,
    observe_improvement_effect,
    show_improvement_effect,
)


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


def _revision_api():
    from ensemble_agent_revisions import (
        apply_agent_skill_revision,
        propose_agent_skill_revision,
        rollback_agent_skill_revision,
        serialize_skill_manifest,
    )

    return {
        "apply": apply_agent_skill_revision,
        "propose": propose_agent_skill_revision,
        "rollback": rollback_agent_skill_revision,
        "serialize": serialize_skill_manifest,
    }


def _observe_effect_process(
    workspace: str,
    revision_id: str,
    observed_id: str,
    actor_name: str,
    rendezvous_path: str,
    result_queue,
) -> None:
    import ensemble_improvement_effects as effects

    rendezvous = Path(rendezvous_path)
    real_append = effects.append_event

    def synchronized_append(
        workspace_value,
        *,
        event_type,
        actor=None,
        scope=None,
        severity="info",
        payload=None,
        rules=None,
        shard_by_date=False,
    ):
        if event_type == effects.EFFECT_EVENT:
            (rendezvous / f"ready-{actor_name}").write_text("ready", encoding="utf-8")
            deadline = time.monotonic() + 0.75
            while len(list(rendezvous.glob("ready-*"))) < 2 and time.monotonic() < deadline:
                time.sleep(0.01)
        return real_append(
            workspace_value,
            event_type=event_type,
            actor=actor,
            scope=scope,
            severity=severity,
            payload=payload,
            rules=rules,
            shard_by_date=shard_by_date,
        )

    effects.append_event = synchronized_append
    try:
        result = effects.observe_improvement_effect(
            workspace,
            effects.EffectObservationRequest(
                revision_id=revision_id,
                observed_closure_artifact_id=observed_id,
                actor=actor_name,
            ),
        )
        result_queue.put({"status": "ok", "observation_id": result["observation_id"]})
    except effects.EffectObservationError as exc:
        result_queue.put({"status": "conflict", "message": str(exc)})


class ImprovementEffectMeasurementTests(unittest.TestCase):
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

    def test_observe_appends_metadata_only_event_for_exact_comparison_key(self) -> None:
        source = self._closure(
            "effect-source",
            comparison_key="workflow.context-curator:v1",
            provider_tokens=300,
            provider_latency_ms=1200,
        )
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure(
            "effect-observed",
            comparison_key="workflow.context-curator:v1",
            provider_tokens=240,
            provider_latency_ms=900,
        )
        before_snapshot = self._non_event_snapshot()

        result = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
                actor="supervisor",
                reason_code="post_apply_observation",
            ),
        )

        effect_events = self._effect_events()
        self.assertEqual(len(effect_events), 1)
        self.assertEqual(result["artifact_kind"], "improvement_effect_observation")
        self.assertEqual(result["schema_v"], 1)
        self.assertEqual(result["observation_id"], effect_events[0]["payload"]["observation_id"])
        self.assertEqual(effect_events[0]["type"], "improvement.effect_observed")
        self.assertEqual(effect_events[0]["actor"], {"type": "agent", "name": "supervisor"})
        self.assertEqual(
            effect_events[0]["scope"],
            {
                "surface": "agent-improvement",
                "revision_id": revision["revision_id"],
                "observation_id": result["observation_id"],
            },
        )
        self.assertEqual(effect_events[0]["severity"], "info")
        self.assertEqual(
            sorted(effect_events[0]["payload"]),
            [
                "applied_event_id",
                "artifact_kind",
                "candidate_id",
                "candidate_proposal_sha256",
                "candidate_version",
                "comparison_identity",
                "metrics",
                "observation",
                "observation_id",
                "reason_code",
                "revision_id",
                "schema_v",
                "target_ref",
            ],
        )
        self.assertEqual(
            result["comparison_identity"],
            {
                "comparison_key": "workflow.context-curator:v1",
                "source_closure_artifact_id": source.artifact_id,
                "source_closure_event_id": source.event_id,
                "observed_closure_artifact_id": observed.artifact_id,
                "observed_closure_event_id": observed.event_id,
            },
        )
        self.assertEqual(result["observation"]["causal_attribution"], "not_claimed")
        self.assertEqual(result["observation"]["classification"], "improved")
        self.assertEqual(
            result["metrics"]["source"],
            {
                "closure_status": "closed",
                "success": True,
                "validation_passed_count": 1,
                "validation_failed_count": 0,
                "latest_validation_result": "passed",
                "provider_call_count": 1,
                "provider_total_tokens": 300,
                "provider_latency_ms": 1200,
                "approval_requested_count": 0,
                "approval_granted_count": 0,
                "approval_denied_count": 0,
                "explicit_human_actor_count": 0,
                "source_event_count": 3,
            },
        )
        self.assertEqual(
            result["metrics"]["observed"],
            {
                "closure_status": "closed",
                "success": True,
                "validation_passed_count": 1,
                "validation_failed_count": 0,
                "latest_validation_result": "passed",
                "provider_call_count": 1,
                "provider_total_tokens": 240,
                "provider_latency_ms": 900,
                "approval_requested_count": 0,
                "approval_granted_count": 0,
                "approval_denied_count": 0,
                "explicit_human_actor_count": 0,
                "source_event_count": 3,
            },
        )
        self.assertEqual(
            result["metrics"]["delta"],
            {
                "closure_success": 0,
                "validation_passed_count": 0,
                "validation_failed_count": 0,
                "provider_call_count": 0,
                "provider_total_tokens": -60,
                "provider_latency_ms": -300,
                "approval_requested_count": 0,
                "approval_granted_count": 0,
                "approval_denied_count": 0,
                "explicit_human_actor_count": 0,
                "source_event_count": 0,
            },
        )
        self.assertNotIn("closure_bundle", json.dumps(result, ensure_ascii=False))
        self.assertNotIn("Refresh operational context", json.dumps(result, ensure_ascii=False))
        self.assertEqual(self._non_event_snapshot(), before_snapshot)

    def test_missing_or_mismatched_comparison_key_rejects_before_effect_event(self) -> None:
        keyed_source = self._closure("keyed-source", comparison_key="workflow.context-curator:v1")
        unkeyed_source = self._closure("unkeyed-source")
        revision = self._applied_revision(keyed_source.artifact_id)
        missing = self._closure("missing-key")
        mismatched = self._closure("mismatched-key", comparison_key="workflow.other:v1")

        cases = (
            (revision["revision_id"], missing.artifact_id),
            (revision["revision_id"], mismatched.artifact_id),
            (
                self._applied_revision(unkeyed_source.artifact_id, next_manifest=BASE_MANIFEST)["revision_id"],
                self._closure("keyed-observed-after-unkeyed-apply", comparison_key="workflow.context-curator:v1").artifact_id,
            ),
        )
        for revision_id, observed_artifact_id in cases:
            with self.subTest(revision_id=revision_id, observed_artifact_id=observed_artifact_id):
                baseline = len(self._effect_events())
                with self.assertRaisesRegex(EffectObservationError, "comparison key"):
                    observe_improvement_effect(
                        self.workspace,
                        EffectObservationRequest(
                            revision_id=revision_id,
                            observed_closure_artifact_id=observed_artifact_id,
                        ),
                    )
                self.assertEqual(len(self._effect_events()), baseline)

    def test_source_closure_with_more_than_fifty_events_keeps_bounded_candidate_linkage(self) -> None:
        source = self._closure(
            "large-source-history",
            comparison_key="workflow.context-curator:v1",
            extra_source_events=55,
        )
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("large-source-observed", comparison_key="workflow.context-curator:v1")

        effect = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        self.assertGreater(effect["metrics"]["source"]["source_event_count"], 50)
        self.assertEqual(len(self._effect_events()), 1)

    def test_pre_apply_observation_and_rolled_back_revision_reject_before_effect_event(self) -> None:
        source = self._closure("preapply-source", comparison_key="workflow.context-curator:v1")
        observed_before_apply = self._closure("preapply-observed", comparison_key="workflow.context-curator:v1")
        revision = self._proposed_revision(source.artifact_id)

        with self.assertRaisesRegex(EffectObservationError, "applied"):
            observe_improvement_effect(
                self.workspace,
                EffectObservationRequest(
                    revision_id=revision["revision_id"],
                    observed_closure_artifact_id=observed_before_apply.artifact_id,
                ),
            )
        self.assertEqual(self._effect_events(), [])

        api = _revision_api()
        api["apply"](self.workspace, revision["revision_id"], reason_code="accepted_as_bounded")
        api["rollback"](self.workspace, revision["revision_id"], reason_code="operator_revert")
        observed_after_rollback = self._closure("rollback-observed", comparison_key="workflow.context-curator:v1")

        with self.assertRaisesRegex(EffectObservationError, "rolled back"):
            observe_improvement_effect(
                self.workspace,
                EffectObservationRequest(
                    revision_id=revision["revision_id"],
                    observed_closure_artifact_id=observed_after_rollback.artifact_id,
                ),
            )
        self.assertEqual(self._effect_events(), [])

    def test_effect_replay_remains_readable_after_later_valid_rollback(self) -> None:
        source = self._closure("post-observation-rollback-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("post-observation-rollback-observed", comparison_key="workflow.context-curator:v1")
        effect = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        _revision_api()["rollback"](
            self.workspace,
            revision["revision_id"],
            reason_code="operator_revert",
        )

        self.assertEqual(show_improvement_effect(self.workspace, effect["observation_id"]), effect)
        self.assertEqual(list_improvement_effects(self.workspace), [effect])

    def test_duplicate_effect_appended_after_rollback_fails_closed(self) -> None:
        source = self._closure("post-rollback-duplicate-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("post-rollback-duplicate-observed", comparison_key="workflow.context-curator:v1")
        effect = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )
        original_event = deepcopy(self._effect_events()[0])
        _revision_api()["rollback"](
            self.workspace,
            revision["revision_id"],
            reason_code="operator_revert",
        )
        append_event(
            self.workspace,
            event_type="improvement.effect_observed",
            actor=original_event["actor"],
            scope=original_event["scope"],
            payload=original_event["payload"],
        )

        with self.assertRaises(EffectObservationError):
            show_improvement_effect(self.workspace, effect["observation_id"])
        with self.assertRaises(EffectObservationError):
            list_improvement_effects(self.workspace)

    def test_effect_event_before_observed_closure_rejects_replay(self) -> None:
        source = self._closure("reordered-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("reordered-observed", comparison_key="workflow.context-curator:v1")
        effect = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )
        events = load_events(self.workspace)
        effect_event = next(event for event in events if event["type"] == "improvement.effect_observed")
        reordered = [event for event in events if event is not effect_event]
        observed_index = next(
            index
            for index, event in enumerate(reordered)
            if event.get("event_id") == observed.event_id
        )
        reordered.insert(observed_index, effect_event)
        replay_workspace = self._event_only_workspace(reordered)

        with self.assertRaises(EffectObservationError):
            show_improvement_effect(replay_workspace, effect["observation_id"])
        with self.assertRaises(EffectObservationError):
            list_improvement_effects(replay_workspace)

    def test_secret_shaped_applied_event_id_rejects_before_effect_append(self) -> None:
        source = self._closure("secret-applied-id-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("secret-applied-id-observed", comparison_key="workflow.context-curator:v1")
        forged_event_id = "github_pat_11AAABBBCCCDDDEEEFFF000111222333444"
        self._rewrite_events(
            self.workspace,
            lambda event: {**event, "event_id": forged_event_id}
            if event["type"] == "improvement.revision_applied"
            and event["payload"].get("revision_id") == revision["revision_id"]
            else event,
        )
        baseline = load_events(self.workspace)

        with self.assertRaises(EffectObservationError):
            observe_improvement_effect(
                self.workspace,
                EffectObservationRequest(
                    revision_id=revision["revision_id"],
                    observed_closure_artifact_id=observed.artifact_id,
                ),
            )

        self.assertEqual(load_events(self.workspace), baseline)
        self.assertEqual(self._effect_events(), [])

    def test_forged_applied_event_envelope_rejects_before_effect_append(self) -> None:
        source = self._closure("forged-applied-envelope-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("forged-applied-envelope-observed", comparison_key="workflow.context-curator:v1")
        source_events = load_events(self.workspace)

        for mutation in ("severity", "redaction", "owner_name"):
            with self.subTest(mutation=mutation):
                clone = Path(tempfile.mkdtemp(dir=self.temp_dir.name))
                self.addCleanup(lambda path=clone: shutil.rmtree(path, ignore_errors=True))
                shutil.copytree(self.workspace, clone, dirs_exist_ok=True)

                def forge_applied_envelope(event):
                    if (
                        event["type"] != "improvement.revision_applied"
                        or event["payload"].get("revision_id") != revision["revision_id"]
                    ):
                        return event
                    changed = deepcopy(event)
                    if mutation == "severity":
                        changed["severity"] = "error"
                    elif mutation == "redaction":
                        changed["redaction"] = {"applied": True, "rules": ["token"]}
                    else:
                        changed["actor"]["name"] = "github_pat_11AAABBBCCCDDDEEEFFF000111222333444"
                    return changed

                self._rewrite_events(clone, forge_applied_envelope)
                baseline = load_events(clone)
                self.assertEqual(len(baseline), len(source_events))
                with self.assertRaises(EffectObservationError):
                    observe_improvement_effect(
                        clone,
                        EffectObservationRequest(
                            revision_id=revision["revision_id"],
                            observed_closure_artifact_id=observed.artifact_id,
                        ),
                    )
                self.assertEqual(load_events(clone), baseline)

    def test_unknown_token_and_latency_metrics_remain_none(self) -> None:
        source = self._closure("unknown-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("unknown-observed", comparison_key="workflow.context-curator:v1")

        result = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        self.assertIsNone(result["metrics"]["source"]["provider_total_tokens"])
        self.assertIsNone(result["metrics"]["observed"]["provider_total_tokens"])
        self.assertIsNone(result["metrics"]["source"]["provider_latency_ms"])
        self.assertIsNone(result["metrics"]["observed"]["provider_latency_ms"])
        self.assertNotEqual(result["metrics"]["source"]["provider_total_tokens"], 0)
        self.assertNotEqual(result["metrics"]["observed"]["provider_latency_ms"], 0)

    def test_partial_provider_telemetry_does_not_render_a_misleading_exact_total(self) -> None:
        source = self._closure(
            "partial-source",
            comparison_key="workflow.context-curator:v1",
            provider_tokens=100,
            provider_latency_ms=500,
            incomplete_provider=True,
        )
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure(
            "partial-observed",
            comparison_key="workflow.context-curator:v1",
            provider_tokens=90,
            provider_latency_ms=400,
        )

        result = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        self.assertIsNone(result["metrics"]["source"]["provider_total_tokens"])
        self.assertIsNone(result["metrics"]["source"]["provider_latency_ms"])
        self.assertIsNone(result["metrics"]["delta"]["provider_total_tokens"])
        self.assertIsNone(result["metrics"]["delta"]["provider_latency_ms"])
        self.assertIn(
            "source:provider_total_tokens_unknown",
            result["observation"]["unknown_reason_codes"],
        )

    def test_missing_apply_approval_events_rejects_even_when_applied_event_exists(self) -> None:
        source = self._closure("missing-apply-grant-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("missing-apply-grant-observed", comparison_key="workflow.context-curator:v1")
        stripped_events = [
            event
            for event in load_events(self.workspace)
            if not (
                event["type"] in {"approval.requested", "approval.granted"}
                and event.get("payload", {}).get("action_type") == "apply_agent_revision"
            )
        ]
        replay_workspace = self._event_only_workspace(stripped_events)

        with self.assertRaisesRegex(EffectObservationError, "apply approval"):
            observe_improvement_effect(
                replay_workspace,
                EffectObservationRequest(
                    revision_id=revision["revision_id"],
                    observed_closure_artifact_id=observed.artifact_id,
                ),
            )
        self.assertEqual(
            [event["type"] for event in load_events(replay_workspace) if event["type"].startswith("improvement.")],
            ["improvement.candidate_proposed", "improvement.revision_proposed", "improvement.revision_applied"],
        )

    def test_exact_retry_and_same_observation_threads_are_idempotent(self) -> None:
        source = self._closure("retry-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("retry-observed", comparison_key="workflow.context-curator:v1")
        request = EffectObservationRequest(
            revision_id=revision["revision_id"],
            observed_closure_artifact_id=observed.artifact_id,
        )

        first = observe_improvement_effect(self.workspace, request)
        second = observe_improvement_effect(self.workspace, request)
        with ThreadPoolExecutor(max_workers=2) as pool:
            threaded = list(pool.map(lambda _: observe_improvement_effect(self.workspace, request), range(2)))

        self.assertEqual(second["observation_id"], first["observation_id"])
        self.assertEqual([item["observation_id"] for item in threaded], [first["observation_id"], first["observation_id"]])
        self.assertEqual(len(self._effect_events()), 1)

    def test_conflicting_cross_process_observation_commits_only_once(self) -> None:
        source = self._closure("process-race-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("process-race-observed", comparison_key="workflow.context-curator:v1")
        rendezvous = self.workspace / "process-race"
        rendezvous.mkdir()
        context = multiprocessing.get_context("spawn")
        result_queue = context.Queue()
        processes = [
            context.Process(
                target=_observe_effect_process,
                args=(
                    str(self.workspace),
                    revision["revision_id"],
                    observed.artifact_id,
                    actor,
                    str(rendezvous),
                    result_queue,
                ),
            )
            for actor in ("observer-a", "observer-b")
        ]
        for process in processes:
            process.start()
        for process in processes:
            process.join(timeout=20)
            self.assertFalse(process.is_alive())
            self.assertEqual(process.exitcode, 0)
        results = [result_queue.get(timeout=5) for _ in processes]

        self.assertEqual(sorted(result["status"] for result in results), ["conflict", "ok"])
        effect_events = self._effect_events()
        self.assertEqual(len(effect_events), 1)
        self.assertEqual(
            show_improvement_effect(self.workspace, effect_events[0]["payload"]["observation_id"]),
            effect_events[0]["payload"],
        )

    def test_wrong_scope_and_conflicting_replay_fail_closed(self) -> None:
        source = self._closure("replay-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("replay-observed", comparison_key="workflow.context-curator:v1")
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )
        event = self._effect_events()[0]

        wrong_scope = self._event_only_workspace(load_events(self.workspace))
        self._rewrite_events(
            wrong_scope,
            lambda item: {
                **item,
                "scope": {"surface": "wrong", "revision_id": revision["revision_id"], "observation_id": clean["observation_id"]},
            }
            if item["type"] == "improvement.effect_observed"
            else item,
        )
        with self.assertRaises(EffectObservationError):
            show_improvement_effect(wrong_scope, clean["observation_id"])

        conflicting = self._event_only_workspace(load_events(self.workspace))
        forged_payload = deepcopy(event["payload"])
        forged_payload["metrics"] = {**forged_payload["metrics"], "source": {"provider_call_count": 999}}
        append_event(
            conflicting,
            event_type="improvement.effect_observed",
            actor=event["actor"],
            scope=event["scope"],
            payload=forged_payload,
        )
        with self.assertRaises(EffectObservationError):
            list_improvement_effects(conflicting)

    def test_effect_actor_name_mutation_fails_show_and_list_replay(self) -> None:
        source = self._closure("actor-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("actor-observed", comparison_key="workflow.context-curator:v1")
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
                actor="supervisor",
            ),
        )
        mutated = self._event_only_workspace(load_events(self.workspace))
        self._rewrite_events(
            mutated,
            lambda event: {**event, "actor": {"type": "agent", "name": "forged"}}
            if event["type"] == "improvement.effect_observed"
            else event,
        )

        with self.assertRaises(EffectObservationError):
            show_improvement_effect(mutated, clean["observation_id"])
        with self.assertRaises(EffectObservationError):
            list_improvement_effects(mutated)

    def test_bool_for_integer_effect_fields_fails_show_and_list_replay(self) -> None:
        source = self._closure(
            "bool-type-source",
            comparison_key="workflow.context-curator:v1",
            provider_tokens=100,
        )
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure(
            "bool-type-observed",
            comparison_key="workflow.context-curator:v1",
            provider_tokens=90,
        )
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        for field in ("event_v", "schema_v", "provider_call_count"):
            with self.subTest(field=field):
                mutated = self._event_only_workspace(load_events(self.workspace))

                def replace_integer(event):
                    if event["type"] != "improvement.effect_observed":
                        return event
                    changed = deepcopy(event)
                    if field == "event_v":
                        changed["event_v"] = True
                    elif field == "schema_v":
                        changed["payload"]["schema_v"] = True
                    else:
                        changed["payload"]["metrics"]["source"]["provider_call_count"] = True
                    return changed

                self._rewrite_events(mutated, replace_integer)
                with self.assertRaises(EffectObservationError):
                    show_improvement_effect(mutated, clean["observation_id"])
                with self.assertRaises(EffectObservationError):
                    list_improvement_effects(mutated)

    def test_effect_event_exact_envelope_fails_show_and_list_replay(self) -> None:
        source = self._closure("effect-envelope-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("effect-envelope-observed", comparison_key="workflow.context-curator:v1")
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        for mutation in ("extra_private_field", "invalid_timestamp"):
            with self.subTest(mutation=mutation):
                mutated = self._event_only_workspace(load_events(self.workspace))

                def replace_envelope(event):
                    if event["type"] != "improvement.effect_observed":
                        return event
                    changed = deepcopy(event)
                    if mutation == "extra_private_field":
                        changed["provider_prompt"] = "PRIVATE RAW BODY"
                    else:
                        changed["ts_utc"] = 1
                    return changed

                self._rewrite_events(mutated, replace_envelope)
                with self.assertRaises(EffectObservationError):
                    show_improvement_effect(mutated, clean["observation_id"])
                with self.assertRaises(EffectObservationError):
                    list_improvement_effects(mutated)

    def test_closure_exact_envelope_and_scalars_fail_show_and_list_replay(self) -> None:
        source = self._closure("closure-envelope-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("closure-envelope-observed", comparison_key="workflow.context-curator:v1")
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        for mutation in (
            "bool_event_version",
            "integer_redaction_flag",
            "integer_promotion_flag",
            "extra_private_field",
            "invalid_event_timestamp",
            "private_created_at",
        ):
            with self.subTest(mutation=mutation):
                events = deepcopy(load_events(self.workspace))
                closure_event = next(event for event in events if event.get("event_id") == observed.event_id)
                closure_payload = closure_event["payload"]
                bundle = closure_payload["closure_bundle"]
                index_record = closure_payload["index_record"]
                if mutation == "bool_event_version":
                    closure_event["event_v"] = True
                elif mutation == "integer_redaction_flag":
                    closure_event["redaction"]["applied"] = 0
                elif mutation == "integer_promotion_flag":
                    index_record["promotion_available"] = 0
                elif mutation == "extra_private_field":
                    closure_event["provider_prompt"] = "PRIVATE RAW BODY"
                elif mutation == "invalid_event_timestamp":
                    closure_event["ts_utc"] = 1
                else:
                    bundle["created_at"] = "/private/customer/export.json"
                    index_record["created_at"] = "/private/customer/export.json"
                    closure_payload["artifact_sha256"] = json_hash(bundle)
                    closure_payload["digest_sha256"] = sha256(
                        render_closure_digest(bundle).encode("utf-8")
                    ).hexdigest()
                mutated = self._event_only_workspace(events)

                with self.assertRaises(EffectObservationError):
                    show_improvement_effect(mutated, clean["observation_id"])
                with self.assertRaises(EffectObservationError):
                    list_improvement_effects(mutated)

    def test_nested_private_closure_content_fails_show_and_list_replay(self) -> None:
        source = self._closure("nested-private-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("nested-private-observed", comparison_key="workflow.context-curator:v1")
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        for mutation in ("prompt_field", "raw_summary", "path_summary", "secret_reason"):
            with self.subTest(mutation=mutation):
                events = deepcopy(load_events(self.workspace))
                closure_event = next(event for event in events if event.get("event_id") == observed.event_id)
                closure_payload = closure_event["payload"]
                bundle = closure_payload["closure_bundle"]
                if mutation == "prompt_field":
                    bundle["episode_summary"]["provider_prompt"] = "private prompt body"
                elif mutation == "raw_summary":
                    bundle["episode_summary"]["summary"] = "raw transcript body"
                    closure_payload["summary"] = "raw transcript body"
                    closure_payload["index_record"]["summary"] = "raw transcript body"
                elif mutation == "path_summary":
                    bundle["episode_summary"]["summary"] = "/private/customer/export.json"
                    closure_payload["summary"] = "/private/customer/export.json"
                    closure_payload["index_record"]["summary"] = "/private/customer/export.json"
                else:
                    bundle["next_workflow_recommendation"]["reason"] = "ghp_abcdefghijklmnopqrstuvwxyz"
                closure_payload["artifact_sha256"] = json_hash(bundle)
                closure_payload["digest_sha256"] = sha256(
                    render_closure_digest(bundle).encode("utf-8")
                ).hexdigest()
                mutated = self._event_only_workspace(events)

                with self.assertRaises(EffectObservationError):
                    show_improvement_effect(mutated, clean["observation_id"])
                with self.assertRaises(EffectObservationError):
                    list_improvement_effects(mutated)

    def test_safe_closure_actions_and_findings_remain_observable(self) -> None:
        source = self._closure("safe-detail-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("safe-detail-observed", comparison_key="workflow.context-curator:v1")
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )
        events = deepcopy(load_events(self.workspace))
        closure_event = next(event for event in events if event.get("event_id") == observed.event_id)
        bundle = closure_event["payload"]["closure_bundle"]
        bundle["episode_summary"]["key_actions"] = ["Validated the bounded workflow"]
        bundle["episode_summary"]["key_findings"] = ["Public metadata remained stable"]
        closure_event["payload"]["artifact_sha256"] = json_hash(bundle)
        replay_workspace = self._event_only_workspace(events)

        self.assertEqual(show_improvement_effect(replay_workspace, clean["observation_id"]), clean)
        self.assertEqual(list_improvement_effects(replay_workspace), [clean])

    def test_safe_multiline_closure_summary_remains_observable(self) -> None:
        source = self._closure("multiline-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure(
            "multiline-observed",
            comparison_key="workflow.context-curator:v1",
            summary="Validated first line.\n\tValidated second line.",
        )

        effect = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        self.assertEqual(show_improvement_effect(self.workspace, effect["observation_id"]), effect)
        self.assertEqual(list_improvement_effects(self.workspace), [effect])

    def test_clean_event_only_replay_succeeds_and_identical_duplicate_collapses(self) -> None:
        source = self._closure("event-only-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("event-only-observed", comparison_key="workflow.context-curator:v1")
        clean = observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )
        event = self._effect_events()[0]
        replay_workspace = self._event_only_workspace(load_events(self.workspace))

        self.assertEqual(show_improvement_effect(replay_workspace, clean["observation_id"]), clean)
        self.assertEqual(list_improvement_effects(replay_workspace), [clean])
        append_event(
            replay_workspace,
            event_type="improvement.effect_observed",
            actor=event["actor"],
            scope=event["scope"],
            payload=event["payload"],
        )
        self.assertEqual(list_improvement_effects(replay_workspace), [clean])

    def test_observe_does_not_create_effect_projection_file_or_sqlite_state(self) -> None:
        source = self._closure("projection-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("projection-observed", comparison_key="workflow.context-curator:v1")
        before = self._non_event_snapshot()

        observe_improvement_effect(
            self.workspace,
            EffectObservationRequest(
                revision_id=revision["revision_id"],
                observed_closure_artifact_id=observed.artifact_id,
            ),
        )

        self.assertEqual(self._non_event_snapshot(), before)
        self.assertEqual(list(self.workspace.rglob("*effect*")), [])
        self.assertEqual(list(self.workspace.rglob("*.sqlite3")), [])

    def test_cli_observe_show_and_list_are_ascii_safe_metadata_only(self) -> None:
        source = self._closure("cli-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("cli-observed", comparison_key="workflow.context-curator:v1")

        observed_result = self._run_cli(
            "improvement",
            "effect-observe",
            revision["revision_id"],
            "--observed-closure",
            observed.artifact_id,
            "--actor",
            "supervisor",
            "--reason-code",
            "post_apply_observation",
        )
        observed_payload = json.loads(observed_result.stdout)
        show_payload = json.loads(self._run_cli("improvement", "effect-show", observed_payload["observation_id"]).stdout)
        list_payload = json.loads(self._run_cli("improvement", "effect-list", "--revision-id", revision["revision_id"]).stdout)

        combined = json.dumps([observed_payload, show_payload, list_payload], ensure_ascii=True)
        self.assertTrue(combined.isascii())
        self.assertNotIn(str(self.workspace.resolve()), combined)
        self.assertNotIn("closure_bundle", combined)
        self.assertNotIn("manifest", combined)
        self.assertEqual(list_payload[0]["observation_id"], observed_payload["observation_id"])

    def test_unsafe_effect_actor_and_reason_reject_before_append_without_cli_leak(self) -> None:
        source = self._closure("unsafe-request-source", comparison_key="workflow.context-curator:v1")
        revision = self._applied_revision(source.artifact_id)
        observed = self._closure("unsafe-request-observed", comparison_key="workflow.context-curator:v1")
        baseline = load_events(self.workspace)
        unsafe_requests = (
            {"actor": "github_pat_11AAABBBCCCDDDEEEFFF000111222333444"},
            {"actor": "AKIAIOSFODNN7EXAMPLE"},
            {"actor": "token:supersecret123"},
            {"actor": "operator\nforged"},
            {"actor": "operator\x00forged"},
            {"reason_code": "github_pat_11aaabbbcccdddeeefff000111222333444"},
            {"reason_code": "token:supersecret123"},
        )
        for changes in unsafe_requests:
            with self.subTest(changes=changes):
                request = {
                    "revision_id": revision["revision_id"],
                    "observed_closure_artifact_id": observed.artifact_id,
                    **changes,
                }
                with self.assertRaises(EffectObservationError):
                    observe_improvement_effect(self.workspace, EffectObservationRequest(**request))
                self.assertEqual(load_events(self.workspace), baseline)

        unsafe_actor = "github_pat_11AAABBBCCCDDDEEEFFF000111222333444"
        cli_result = self._run_cli_unchecked(
            "improvement",
            "effect-observe",
            revision["revision_id"],
            "--observed-closure",
            observed.artifact_id,
            "--actor",
            unsafe_actor,
        )
        self.assertNotEqual(cli_result.returncode, 0)
        self.assertNotIn(unsafe_actor, cli_result.stdout + cli_result.stderr)
        self.assertEqual(load_events(self.workspace), baseline)

    def _closure(
        self,
        episode_id: str,
        *,
        comparison_key: str | None = None,
        summary: str = "Validated episode ready for effect observation.",
        provider_tokens: int | None = None,
        provider_latency_ms: int | None = None,
        incomplete_provider: bool = False,
        extra_source_events: int = 0,
    ):
        task_event = append_event(
            self.workspace,
            event_type="task.created",
            actor={"type": "agent", "name": "test"},
            scope={"episode_id": episode_id, "run_id": f"run-{episode_id}"},
            payload={"episode_id": episode_id, "summary": "seed episode"},
        )
        for index in range(extra_source_events):
            append_event(
                self.workspace,
                event_type="task.created",
                actor={"type": "agent", "name": "test"},
                scope={"episode_id": episode_id, "run_id": f"run-{episode_id}"},
                payload={"episode_id": episode_id, "summary": f"source event {index}"},
            )
        if provider_tokens is not None or provider_latency_ms is not None:
            append_event(
                self.workspace,
                event_type="provider.call_recorded",
                actor={"type": "agent", "name": "worker"},
                scope={"episode_id": episode_id},
                payload={
                    "provider": "fixture",
                    "model": "fixture-model",
                    "input_tokens": provider_tokens or 0,
                    "output_tokens": 0,
                    "total_tokens": provider_tokens or 0,
                    "estimated_cost": None,
                    "latency_ms": provider_latency_ms,
                    "tool_calls_count": 0,
                    "pii_findings": 0,
                    "run_id": f"run-{episode_id}",
                    "iteration_id": None,
                    "task_id": episode_id,
                    "agent_id": "worker",
                    "evidence_refs": [],
                },
            )
        if incomplete_provider:
            append_event(
                self.workspace,
                event_type="provider.call_recorded",
                actor={"type": "agent", "name": "worker"},
                scope={"episode_id": episode_id},
                payload={
                    "provider": "fixture",
                    "model": "fixture-model-with-missing-telemetry",
                    "run_id": f"run-{episode_id}",
                    "task_id": episode_id,
                    "agent_id": "worker",
                    "evidence_refs": [],
                },
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
                summary=summary,
                goal="Create a replayable effect observation",
                confidence="high",
                comparison_key=comparison_key,
            ),
        )

    def _proposed_revision(self, closure_artifact_id: str, *, next_manifest: dict | None = None) -> dict:
        api = _revision_api()
        candidate = propose_improvement_candidate(
            self.workspace,
            CandidateProposal(
                closure_artifact_id=closure_artifact_id,
                kind="skill_patch",
                target_ref="skills/context-curator",
                summary="Revise context curator manifest.",
                change_summary=("Materialize the structured skill manifest.",),
                impact_areas=("skill_manifest",),
                actor="supervisor",
            ),
        )
        approved = decide_improvement_candidate(
            self.workspace,
            candidate["candidate_id"],
            decision="approved",
            reviewer="owner",
            reason_code="accepted_as_bounded",
        )
        return api["propose"](
            self.workspace,
            approved["candidate_id"],
            next_manifest or NEXT_MANIFEST,
            actor="supervisor",
        )

    def _applied_revision(self, closure_artifact_id: str, *, next_manifest: dict | None = None) -> dict:
        api = _revision_api()
        proposed = self._proposed_revision(closure_artifact_id, next_manifest=next_manifest)
        return api["apply"](self.workspace, proposed["revision_id"], reason_code="accepted_as_bounded")

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

    def _effect_events(self) -> list[dict]:
        return [event for event in load_events(self.workspace) if event["type"] == "improvement.effect_observed"]

    def _non_event_snapshot(self) -> dict[str, bytes]:
        return {
            path.relative_to(self.workspace).as_posix(): path.read_bytes()
            for path in self.workspace.rglob("*")
            if path.is_file() and "/events/" not in path.relative_to(self.workspace).as_posix()
        }

    def _event_only_workspace(self, source_events: list[dict]) -> Path:
        clean = Path(tempfile.mkdtemp(dir=self.temp_dir.name))
        self.addCleanup(lambda: shutil.rmtree(clean, ignore_errors=True))
        event_file = clean / ".notes" / "events" / "events.jsonl"
        event_file.parent.mkdir(parents=True, exist_ok=True)
        event_file.write_text(
            "".join(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n" for event in source_events),
            encoding="utf-8",
        )
        return clean

    def _rewrite_events(self, workspace: Path, mutate) -> None:
        events = [mutate(deepcopy(event)) for event in load_events(workspace)]
        event_file = workspace / ".notes" / "events" / "events.jsonl"
        event_file.parent.mkdir(parents=True, exist_ok=True)
        event_file.write_text(
            "".join(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n" for event in events),
            encoding="utf-8",
        )

    def _run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "ensemble.py"),
                "--workspace",
                str(self.workspace),
                *args,
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )

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
