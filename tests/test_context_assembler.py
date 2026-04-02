from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from ensemble_context_assembler import ContextAssembler
from ensemble_context_markdown import ContextRegenerator, FindingsAppendService, ProgressAppendOnlyService, TaskPlanWriterReader
from ensemble_iteration_service import IterationService
from ensemble_loop_repository import LoopStateRepository
from ensemble_persona_memory import CandidatePatchWriter, MemoryRepository
from ensemble_room_service import RoomService
from ensemble_run_service import RunService


class ContextAssemblerTests(unittest.TestCase):
    def prepare_workspace(self) -> tuple[Path, LoopStateRepository, RunService, IterationService]:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / ".conitens" / "personas").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context").mkdir(parents=True, exist_ok=True)
        (root / ".vibe" / "context" / "LATEST_CONTEXT.md").write_text(
            "# LATEST_CONTEXT\n\nrepo digest\n",
            encoding="utf-8",
        )
        (root / ".conitens" / "personas" / "sample-agent.yaml").write_text(
            "\n".join(
                [
                    "id: sample-agent",
                    "display_name: Sample Agent",
                    "role: architect",
                    "public_persona: calm and direct",
                    "private_policy:",
                    "  identity_core_locked: true",
                    "expertise_tags:",
                    "  - runtime",
                    "default_skill_refs:",
                    "  - conitens-core",
                    "memory_namespace: sample-namespace",
                    "handoff:",
                    "  preferred_format: checklist",
                    "self_improvement:",
                    "  allow_candidate_patches: true",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        (root / ".agents" / "skills" / "conitens-core").mkdir(parents=True, exist_ok=True)
        (root / ".agents" / "skills" / "conitens-core" / "SKILL.md").write_text(
            "---\nschema_v: 1\nskill_id: conitens-core\nname: conitens-core\ndescription: core\ntools:\n  - id: task.create\n    mode: write\n---\n\n# core\n",
            encoding="utf-8",
        )
        repo = LoopStateRepository(root)
        runs = RunService(repo)
        iterations = IterationService(repo)
        return root, repo, runs, iterations

    def populate_state(self, root: Path, repo: LoopStateRepository, runs: RunService, iterations: IterationService) -> tuple[str, str]:
        run = runs.create_run("Assemble minimal packet")
        first = iterations.append_iteration(run["run_id"], "Initial pass")
        iterations.record_validator_result(
            run["run_id"],
            first["iteration_id"],
            passed=False,
            issues=[{"code": "missing-proof"}],
            feedback_text="Need stronger validation evidence",
        )
        second = iterations.append_iteration(run["run_id"], "Retry with validation reason")
        plan = TaskPlanWriterReader(repo)
        findings = FindingsAppendService(repo)
        progress = ProgressAppendOnlyService(repo)
        plan.update_from_structured_input(
            run_id=run["run_id"],
            current_plan="Batch 7 packet assembly",
            objective="Assemble a minimal execution packet",
            steps=[
                {"title": "Collect current task state", "status": "completed"},
                {"title": "Assemble packet", "status": "in_progress"},
            ],
            acceptance_criteria=["Packet stays under budget", "Validator reason is carried forward"],
            owner="sample-agent",
        )
        findings.append_entry(
            run_id=run["run_id"],
            iteration_id=second["iteration_id"],
            category="constraint",
            actor="CLI",
            summary="Do not inject full room transcript",
        )
        findings.append_entry(
            run_id=run["run_id"],
            iteration_id=second["iteration_id"],
            category="validation_issue",
            actor="CLI",
            summary="Retry should include validator failure reason",
        )
        progress.append_entry(
            run_id=run["run_id"],
            iteration_id=second["iteration_id"],
            actor="CLI",
            summary="Prepared packet inputs",
        )
        ContextRegenerator(repo).regenerate_all(run["run_id"])
        memory = MemoryRepository(root)
        memory.write_record(
            agent_id="sample-agent",
            namespace="sample-namespace",
            kind="episodic",
            summary="Remember packet trimming policy",
            evidence_refs=[".conitens/context/findings.md"],
            salience=0.9,
            confidence=0.8,
            source_type="test",
            source_ref="memory-1",
            auto=True,
        )
        memory.write_record(
            agent_id="sample-agent",
            namespace="sample-namespace",
            kind="identity",
            summary="private identity note",
            source_type="test",
            source_ref="identity-1",
            auto=False,
        )
        memory.write_record(
            agent_id="sample-agent",
            namespace="sample-namespace",
            kind="reflection",
            summary="Remember reflection note",
            evidence_refs=[".conitens/context/progress.md"],
            salience=0.7,
            confidence=0.6,
            source_type="test",
            source_ref="memory-2",
            auto=True,
        )
        memory.write_record(
            agent_id="sample-agent",
            namespace="sample-namespace",
            kind="procedural",
            summary="procedural note should stay out of packet",
            evidence_refs=[".conitens/context/findings.md"],
            salience=1.0,
            confidence=1.0,
            source_type="test",
            source_ref="memory-3",
            auto=True,
        )
        CandidatePatchWriter(root).write_patch(
            agent_id="sample-agent",
            namespace="sample-namespace",
            patch_text="private_policy:\n  mode: stricter",
            source_ref="patch-1",
        )
        room = RoomService(root).create_room(
            name="packet-room",
            room_type="discussion",
            participants=["sample-agent"],
            task_id=run["run_id"],
            run_id=run["run_id"],
            iteration_id=second["iteration_id"],
            actor="sample-agent",
        )
        RoomService(root).append_message(
            room_id=room["room_id"],
            sender="sample-agent",
            sender_kind="agent",
            text="first long message " * 20,
            task_id=run["run_id"],
            run_id=run["run_id"],
            iteration_id=second["iteration_id"],
        )
        RoomService(root).append_message(
            room_id=room["room_id"],
            sender="sample-agent",
            sender_kind="agent",
            text="second message",
            task_id=run["run_id"],
            run_id=run["run_id"],
            iteration_id=second["iteration_id"],
        )
        return run["run_id"], second["iteration_id"]

    def test_fresh_run_packet_is_minimal_and_bounded(self) -> None:
        root, repo, runs, iterations = self.prepare_workspace()
        run = runs.create_run("Fresh packet run")
        iterations.append_iteration(run["run_id"], "Fresh iteration")
        TaskPlanWriterReader(repo).update_from_structured_input(
            run_id=run["run_id"],
            current_plan="Fresh packet plan",
            objective="Keep packet intentionally small",
            steps=[{"title": "Fresh step", "status": "in_progress"}],
            acceptance_criteria=["packet is bounded"],
            owner="sample-agent",
        )
        ContextRegenerator(repo).regenerate_all(run["run_id"])

        assembled = ContextAssembler(root).assemble(agent_id="sample-agent", run_id=run["run_id"])
        packet = assembled["packet"]

        self.assertEqual(packet["validator_failure_reason"], None)
        self.assertEqual(packet["episodic_memory_top_k"], [])
        self.assertEqual(packet["recent_message_slice"], [])
        self.assertEqual(packet["tool_whitelist"], ["task.create"])
        self.assertTrue(assembled["metrics"]["within_budget"])

    def test_stable_packet_generation_from_same_state(self) -> None:
        root, repo, runs, iterations = self.prepare_workspace()
        run_id, _iteration_id = self.populate_state(root, repo, runs, iterations)
        assembler = ContextAssembler(root)

        first = assembler.assemble(agent_id="sample-agent", run_id=run_id, token_budget=4000)
        second = assembler.assemble(agent_id="sample-agent", run_id=run_id, token_budget=4000)

        self.assertEqual(first, second)

    def test_packet_excludes_full_transcript(self) -> None:
        root, repo, runs, iterations = self.prepare_workspace()
        run_id, _iteration_id = self.populate_state(root, repo, runs, iterations)
        packet = ContextAssembler(root).assemble(agent_id="sample-agent", run_id=run_id)["packet"]

        self.assertLessEqual(len(packet["recent_message_slice"]), 3)
        self.assertEqual(packet["recent_message_slice"][0]["kind"], "room_episode_summary")
        self.assertIn("messages", packet["recent_message_slice"][0])
        self.assertNotIn("first long message first long message first long message first long message first long message", json.dumps(packet))

    def test_packet_excludes_unapproved_patches(self) -> None:
        root, repo, runs, iterations = self.prepare_workspace()
        run_id, _iteration_id = self.populate_state(root, repo, runs, iterations)
        packet = ContextAssembler(root).assemble(agent_id="sample-agent", run_id=run_id)["packet"]

        packet_text = json.dumps(packet, ensure_ascii=False)
        self.assertNotIn("candidate policy patch", packet_text)
        self.assertNotIn("patch_text", packet_text)
        self.assertNotIn("procedural note should stay out of packet", packet_text)
        self.assertNotIn("private identity note", packet_text)

    def test_validator_failure_reason_is_included_on_retry(self) -> None:
        root, repo, runs, iterations = self.prepare_workspace()
        run_id, _iteration_id = self.populate_state(root, repo, runs, iterations)
        packet = ContextAssembler(root).assemble(agent_id="sample-agent", run_id=run_id)["packet"]

        self.assertEqual(packet["validator_failure_reason"], "Need stronger validation evidence")

    def test_packet_size_below_ceiling_for_fixture(self) -> None:
        root, repo, runs, iterations = self.prepare_workspace()
        run_id, _iteration_id = self.populate_state(root, repo, runs, iterations)
        assembled = ContextAssembler(root).assemble(agent_id="sample-agent", run_id=run_id, token_budget=4000)

        self.assertTrue(assembled["metrics"]["within_budget"])
        self.assertLess(assembled["metrics"]["approx_tokens"], 4000)
        self.assertEqual(
            assembled["metrics"]["exclusion_rules"]["recent_messages_source_order"],
            ["handoff_summary", "room_episode_summary"],
        )
        self.assertEqual(assembled["metrics"]["field_sources"]["validator_failure_reason"], "latest failed validator feedback, bounded to one reason")

    def test_approval_rejection_feedback_is_injected_bounded(self) -> None:
        root, repo, runs, iterations = self.prepare_workspace()
        run = runs.create_run("Approval rejection packet")
        first = iterations.append_iteration(run["run_id"], "Approval rejection iteration")
        TaskPlanWriterReader(repo).update_from_structured_input(
            run_id=run["run_id"],
            current_plan="Approval rejection plan",
            objective="Carry rejection feedback into packet",
            steps=[{"title": "Retry with rejection context", "status": "in_progress"}],
            acceptance_criteria=["rejection feedback is visible"],
            owner="sample-agent",
        )
        iterations.record_validator_result(
            run["run_id"],
            first["iteration_id"],
            passed=False,
            issues=[{"message": "Approval rejected: too risky"}],
            feedback_text="Approval rejected: too risky",
        )
        ContextRegenerator(repo).regenerate_all(run["run_id"])

        packet = ContextAssembler(root).assemble(agent_id="sample-agent", run_id=run["run_id"])["packet"]

        self.assertEqual(packet["validator_failure_reason"], "Approval rejected: too risky")
        self.assertEqual(packet["relevant_findings"], [])


if __name__ == "__main__":
    unittest.main()
