# Conitens v2.1 Development Roadmap

> **Based on 2026 Q1 Agent Orchestration Landscape Research**
>
> Author: Seunghwan Eom (KAIST) + Claude Opus 4.6
> Date: 2026-03-19
> Status: DRAFT — Planning document for future phases

---

## 1. Research Summary: 2026 Agent Orchestration Landscape

### 1.1 Protocol Convergence: MCP + A2A Hybrid

The industry has converged on a **dual-protocol architecture**:

- **MCP (Model Context Protocol)**: Agent → Tool communication (Anthropic)
- **A2A (Agent-to-Agent)**: Agent ↔ Agent communication (Google)
- **ACP (Agent Communication Protocol)**: Emerging alternative from IBM/BeeAI
- **ANP (Agent Network Protocol)**: Chinese ecosystem alternative

**Key insight**: MCP and A2A are complementary, not competing. MCP handles the "vertical" (agent→tool), A2A handles the "horizontal" (agent↔agent). Conitens already implements both at a structural level — the next step is production-grade integration.

**Sources**:
- [MCP vs A2A: When to Use Each Protocol (2026)](https://apigene.ai/blog/mcp-vs-a2a-when-to-use-each-protocol)
- [A2A + MCP Hybrid Architecture: 2026 Production Strategy](https://jangwook.net/en/blog/en/a2a-mcp-hybrid-architecture-production-guide/)
- [Agent-to-Agent Communication Protocol Standards](https://zylos.ai/research/2026-02-15-agent-to-agent-communication-protocols)

### 1.2 Multi-Agent Frameworks

Six production-grade frameworks dominate in 2026:

| Framework | Philosophy | Strength |
|-----------|-----------|----------|
| **LangGraph** | Graph-based workflows | Complex conditional flows |
| **CrewAI** | Role-based teams | Natural role assignment |
| **Google ADK** | Execution framework | DevOps toolchain integration |
| **OpenAI Agents SDK** | Minimal, composable | Handoff patterns |
| **AutoGen** | Conversation patterns | Research/analysis |
| **Mastra** | TypeScript-native | Developer ergonomics |

**Key insight**: Conitens differentiates by being **file-native** and **event-sourced** — no framework lock-in, any CLI agent can participate by reading/writing markdown files.

**Sources**:
- [Best Multi-Agent Frameworks in 2026](https://gurusup.com/blog/best-multi-agent-frameworks-2026)
- [Google ADK Is Not a Toolkit — It Is an Agent Execution Framework](https://futurumgroup.com/insights/google-adk-is-not-a-toolkit-it-is-an-agent-execution-framework/)

### 1.3 Claude Code Agent Teams & Skills

Claude Code's agent teams feature (experimental in 2026) enables:
- **N coordinated agents** working on a shared task list
- **Inter-agent messaging** via SendMessage
- **Subagent delegation** with model routing (haiku/sonnet/opus)
- **Skills system** for reusable capabilities (hooks, rules, commands)

**Key insight**: Conitens' mailbox-based communication (`.conitens/mailboxes/`) maps directly to Claude Code's SendMessage pattern. Skills map to our instruction generator output.

**Sources**:
- [Claude Code Agent Teams: Complete Guide 2026](https://claudefa.st/blog/guide/agents/agent-teams)
- [Claude Agent SDK Guide](https://claudelab.net/en/articles/api-sdk/agent-sdk-guide)
- [10 Must-Have Skills for Claude (2026)](https://medium.com/@unicodeveloper/10-must-have-skills-for-claude-and-any-coding-agent-in-2026-b5451b013051)

### 1.4 Codex CLI Agent Loop & Skills

OpenAI's Codex CLI introduces:
- **Agent loop**: read → plan → execute → verify cycle
- **Skills**: Reusable instruction files (like `.codex/skills/`)
- **Shell + Compaction**: Long-running agent strategies
- **Sandboxed execution**: Container-based isolation

**Key insight**: Codex's skill files are structurally identical to what our InstructionGenerator already produces. The agent loop pattern maps to our Orchestrator command lifecycle.

**Sources**:
- [Unrolling the Codex Agent Loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Shell + Skills + Compaction: Tips for long-running agents](https://developers.openai.com/blog/skills-shell-tips/)

### 1.5 Google ADK Orchestration Patterns

Google ADK defines three orchestration patterns:
- **Sequential**: Tasks run one after another
- **Parallel**: Independent tasks run simultaneously
- **Loop**: Iterative refinement until quality threshold met

Plus **narrative casting** for handoffs — reframing prior agent output as context for the next agent.

**Key insight**: Conitens already implements all three patterns via task state machine transitions, and narrative casting via the HandoffReducer. The key gap is **automated workflow definitions** (currently manual command submission).

**Sources**:
- [Build Multi-Agent Systems with ADK](https://codelabs.developers.google.com/codelabs/production-ready-ai-with-gc/3-developing-agents/build-a-multi-agent-system-with-adk)
- [ADK Integrations Ecosystem](http://googledevelopers.blogspot.ca/supercharge-your-ai-agents-adk-integrations-ecosystem/)

### 1.6 AWS CLI Agent Orchestrator (CAO)

AWS Labs released CAO — a cross-provider CLI agent orchestrator supporting Claude, Codex, and Gemini CLI. It implements:
- Provider-agnostic agent abstraction
- Multi-agent coordination via shared workspace
- Event-driven task management

**Key insight**: CAO validates Conitens' core thesis — heterogeneous CLI agent coordination is a real need. However, CAO uses a centralized Python orchestrator, while Conitens uses a file-native event-sourced approach (no central process required for basic coordination).

**Sources**:
- [cli-agent-orchestrator](https://github.com/awslabs/cli-agent-orchestrator)

---

## 2. Gap Analysis: Conitens v2 vs Industry

### What Conitens Has (Unique Strengths)

| Capability | Conitens v2 | Others |
|-----------|-------------|--------|
| **File-native protocol** | .conitens/ is the API | Requires SDK/runtime |
| **Event sourcing** | Append-only JSONL, full replay | Most use mutable state |
| **5-Plane taxonomy** | Strict file classification | Ad-hoc file organization |
| **Crash recovery** | `replay()` rebuilds all state | Usually manual |
| **Agent-agnostic** | Any CLI agent can participate | Framework-specific |
| **Approval gates** | Human-in-the-loop with TOCTOU hash | Varies |
| **Pre-append redaction** | Secrets never reach event log | Post-hoc only |

### Gaps to Address

| Gap | Industry Standard | Conitens Status |
|-----|------------------|-----------------|
| **Workflow DSL** | ADK/LangGraph define workflows as code | Manual command submission only |
| **Automated agent spawning** | ADK auto-spawns agents per workflow | Manual tmux session management |
| **Streaming events** | SSE/WebSocket with backpressure | Basic WebSocket broadcast |
| **Persistent dedupe** | SQLite-backed with TTL | In-memory Set (loses on restart) |
| **Semantic memory** | Vector + BM25 retrieval | memory.md files only |
| **Observability** | OpenTelemetry SDK integration | Custom JSONL traces |
| **SDK/Client library** | TypeScript/Python SDKs | File-level protocol only |
| **Workflow templates** | Pre-built patterns (review, deploy, etc.) | None |
| **Agent health monitoring** | Heartbeat + auto-restart | Heartbeat only, no restart |
| **Cost tracking** | Token usage per agent/task | Not implemented |

---

## 3. Implementation Roadmap: v2.1 Features

### Phase 6: Workflow Engine (Weeks 21-24)

**Goal**: Declarative workflow definitions that automate multi-agent task sequences.

#### 6.1 Workflow DSL
```yaml
# .conitens/workflows/code-review.yaml
name: code-review
trigger: task.created[tag=review]
steps:
  - agent: claude
    action: implement
    timeout: 30m
  - agent: codex
    action: review
    handoff: narrative
  - agent: gemini
    action: security-scan
    parallel: true
  - gate: human-approval
    on_approve: task.completed
    on_deny: task.failed
```

- **Deliverable**: `packages/core/src/workflows/workflow-engine.ts`
- **Events**: `workflow.started`, `workflow.step_completed`, `workflow.completed`
- **Patterns**: Sequential, Parallel, Loop, Conditional branching
- **Integration**: Orchestrator detects workflow trigger events and auto-executes steps

#### 6.2 Automated Agent Lifecycle
- Auto-spawn agents when workflow requires them
- Auto-kill agents when workflow completes
- Health monitoring with auto-restart on crash
- Agent pool management (max concurrent agents)

#### 6.3 Cost Tracker
```typescript
interface TokenUsage {
  agentId: string;
  taskId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  model: string;
}
```
- Track per-agent, per-task token usage
- Cost aggregation in views/COSTS.md
- Budget alerts via approval gates

### Phase 7: Production Hardening (Weeks 25-28)

#### 7.1 SQLite State Store
- Replace in-memory dedupe with `runtime/state.sqlite`
- Implement `SQLiteReducer` (already in ownership table)
- Add query API for dashboard (task search, event filtering)
- TTL-based dedupe cleanup (24h per RFC)

#### 7.2 Semantic Memory with Vector Search
- `better-sqlite3` + `sqlite-vec` for vector storage
- Hybrid retrieval: 70% vector + 30% BM25 (per recall-policy.yaml)
- Auto-embed memory entries on `memory.update_approved`
- Memory recall on `task.assigned` and `handoff.requested`

#### 7.3 OpenTelemetry SDK Integration
- Replace custom TraceLogger with `@opentelemetry/sdk-node`
- Export to Jaeger, Zipkin, or Langfuse
- Span correlation: trace → event → reducer → view
- Agent-level performance metrics

#### 7.4 chokidar File Watching
- Wire `chokidar` into `serve` command
- Watch `commands/` and `mailboxes/*/inbox/` for new files
- Auto-process command files via Orchestrator
- Debounce rapid file changes

### Phase 8: SDK & Developer Experience (Weeks 29-32)

#### 8.1 TypeScript Client SDK
```typescript
import { ConitensClient } from "@conitens/sdk";

const client = new ConitensClient("ws://localhost:9100");
await client.createTask({ title: "Implement auth", assignee: "claude" });
client.onEvent("task.completed", (event) => { ... });
```

#### 8.2 Python Client SDK
```python
from conitens import ConitensClient

client = ConitensClient("ws://localhost:9100")
await client.create_task(title="Implement auth", assignee="claude")
```

#### 8.3 CLI Enhancements
- `conitens task create/list/assign/complete`
- `conitens agent spawn/kill/list`
- `conitens workflow run/status/cancel`
- `conitens doctor --verify` (all 8 checks from RFC)

#### 8.4 Workflow Templates
Pre-built workflow definitions:
- `code-review.yaml` — Implement → Review → Security → Approve
- `bug-fix.yaml` — Triage → Fix → Test → Verify
- `feature.yaml` — Plan → Implement → Review → Deploy
- `research.yaml` — Search → Analyze → Synthesize → Report

### Phase 9: Advanced Federation (Weeks 33-36)

#### 9.1 Production A2A Server
- HTTP server implementing Google A2A protocol spec
- Agent card endpoint (`/.well-known/agent.json`)
- Task submission/status/cancellation via REST
- Streaming results via SSE

#### 9.2 MCP Server with @modelcontextprotocol/sdk
- Replace structural MCP with production SDK
- All 5 tools wired to real Orchestrator operations
- Resource endpoints for tasks, events, views
- Prompt templates for common operations

#### 9.3 Multi-Instance Federation
- Instance discovery via DNS/mDNS
- Cross-instance task delegation
- Shared event log synchronization (CRDTs)
- Federated agent registry

#### 9.4 ACP/ANP Protocol Support
- IBM BeeAI ACP adapter
- Chinese ecosystem ANP adapter
- Protocol negotiation on connection

### Phase 10: Enterprise Features (Weeks 37-40)

#### 10.1 RBAC (Role-Based Access Control)
- User roles: admin, operator, agent, viewer
- Per-task permissions
- Per-channel permissions
- Audit log of access events

#### 10.2 Multi-Tenant Support
- Namespace isolation per team/project
- Shared agent pools across namespaces
- Cross-namespace task references

#### 10.3 Dashboard Enhancements
- Real-time Kanban with optimistic updates
- Agent performance metrics (success rate, avg time)
- Cost dashboard with budget tracking
- Workflow visualization (DAG editor)

#### 10.4 CI/CD Integration
- GitHub Actions integration
- GitLab CI/CD integration
- Webhook-based workflow triggers
- Deployment approval gates

---

## 4. Priority Matrix

### Immediate (Next 4 weeks)
1. **chokidar file watching** — Makes `serve` command functional
2. **SQLite dedupe** — Fixes RFC §14 compliance
3. **Wire MCP to Orchestrator** — Makes MCP tools real, not stubs
4. **Workflow DSL** — Highest user-impact feature

### Short-term (4-8 weeks)
5. **Semantic memory** — sqlite-vec integration
6. **TypeScript SDK** — Developer adoption
7. **Workflow templates** — Reduce time-to-value
8. **Cost tracking** — Enterprise requirement

### Medium-term (8-16 weeks)
9. **Production A2A server** — Federation capability
10. **OTEL SDK integration** — Observability
11. **CLI enhancements** — Developer ergonomics
12. **Doctor --verify** — All 8 diagnostic checks

### Long-term (16+ weeks)
13. **Multi-instance federation** — Distributed coordination
14. **RBAC** — Enterprise access control
15. **ACP/ANP support** — Protocol ecosystem coverage
16. **CI/CD integration** — DevOps workflows

---

## 5. Competitive Positioning

```
                    Agent-Specific ◄────────────────► Agent-Agnostic
                         │                                    │
   Framework-Bound ──────┤  LangGraph  CrewAI                │
                         │  AutoGen    ADK                    │
                         │                                    │
                         │        OpenAI Agents SDK           │
                         │                                    │
   File-Native ──────────┤              AWS CAO               │
                         │                                    │
                         │                          Conitens ─┤── Event-Sourced
                         │                                    │── Crash-Recoverable
                         │                                    │── Human-Gated
```

**Conitens' unique position**: The only system that is simultaneously:
- **Agent-agnostic** (any CLI agent works)
- **File-native** (no SDK required for basic participation)
- **Event-sourced** (full audit trail, crash recovery)
- **Human-gated** (approval gates, memory curation)

---

## 6. Success Metrics

| Metric | Target | Measurement |
|--------|--------|------------|
| Task lifecycle completion | <5 min for simple tasks | Timestamp diff: created → done |
| Crash recovery | 100% state rebuild | Doctor --verify check #4 |
| Agent coordination latency | <500ms command → event | Event timestamp vs file ctime |
| Dashboard load time | <2s initial render | Lighthouse score |
| Test coverage | >80% line coverage | Vitest coverage report |
| Zero data loss | 0 events lost on crash | fsync + replay verification |

---

*This roadmap is a living document. Priorities may shift based on user feedback and ecosystem changes.*
