/**
 * @module init
 * RFC-1.0.1 §3 — `.conitens/` workspace initializer.
 *
 * Creates the full directory tree, agent persona templates,
 * MODE.md, policy files, and .gitignore.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { PATHS } from "@conitens/protocol";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InitOptions {
  /** Project root directory (`.conitens/` will be created inside). */
  rootDir: string;
  /** Agent identifiers to scaffold. @default ["claude","codex","gemini"] */
  agents?: string[];
  /** Operating mode written to MODE.md. @default "antigravity" */
  mode?: string;
  /** Overwrite an existing `.conitens/` directory. @default false */
  force?: boolean;
}

/**
 * Initialise a `.conitens/` workspace directory tree.
 *
 * Idempotent when `force` is true — existing files are overwritten.
 * Throws if `.conitens/` already exists and `force` is false.
 */
export async function initConitens(options: InitOptions): Promise<void> {
  const {
    rootDir,
    agents = ["claude", "codex", "gemini"],
    mode = "antigravity",
    force = false,
  } = options;

  const base = join(rootDir, ".conitens");

  // Guard: refuse to overwrite unless force=true
  if (!force) {
    const exists = await access(base).then(() => true, () => false);
    if (exists) {
      throw new Error(
        `.conitens/ already exists in ${rootDir}. Pass force=true to overwrite.`,
      );
    }
  }

  // ------------------------------------------------------------------
  // 1. Directories
  // ------------------------------------------------------------------

  const dirs = [
    // Top-level planes / zones (derived from PATHS where possible)
    PATHS.AGENTS_DIR,
    PATHS.TASK_SPECS_DIR,
    PATHS.TASKS_DIR,
    PATHS.DECISIONS_DIR,
    PATHS.HANDOFFS_DIR,
    PATHS.MAILBOXES_DIR,
    PATHS.COMMANDS_DIR,
    PATHS.EVENTS_DIR,
    PATHS.VIEWS_DIR,
    PATHS.RUNTIME_DIR,
    PATHS.RUNTIME_HEARTBEAT,
    PATHS.RUNTIME_LOCKS,
    PATHS.RUNTIME_PIDS,
    PATHS.TRACES_DIR,
    PATHS.POLICIES_DIR,
    PATHS.CONFIG_DIR,
    // Broadcast mailbox
    "mailboxes/broadcast/",
  ];

  // Per-agent directories
  for (const agent of agents) {
    dirs.push(
      `${PATHS.AGENTS_DIR}${agent}/`,
      `${PATHS.MAILBOXES_DIR}${agent}/inbox/`,
    );
  }

  await Promise.all(
    dirs.map((d) => mkdir(join(base, d), { recursive: true })),
  );

  // ------------------------------------------------------------------
  // 2. Agent template files
  // ------------------------------------------------------------------

  const CLI_TOOLS: Record<string, string> = {
    claude: "claude-code",
    codex: "codex-cli",
    gemini: "gemini-cli",
  };

  const writes: Promise<void>[] = [];

  for (const agent of agents) {
    const agentDir = join(base, PATHS.AGENTS_DIR, agent);
    const displayName = agent.charAt(0).toUpperCase() + agent.slice(1);
    const cliTool = CLI_TOOLS[agent] ?? `${agent}-cli`;

    writes.push(
      writeFile(
        join(agentDir, "persona.yaml"),
        personaYaml(agent, displayName, cliTool),
      ),
      writeFile(
        join(agentDir, "recall-policy.yaml"),
        recallPolicyYaml(agent),
      ),
      writeFile(
        join(agentDir, "memory.proposed.md"),
        "<!-- Proposed memory updates \u2014 awaiting human review -->\n",
      ),
      writeFile(
        join(agentDir, "memory.md"),
        "<!-- Curated agent memory \u2014 updated only via memory.update_approved events -->\n",
      ),
    );
  }

  // ------------------------------------------------------------------
  // 3. MODE.md
  // ------------------------------------------------------------------

  writes.push(writeFile(join(base, PATHS.MODE), modeMd(mode)));

  // ------------------------------------------------------------------
  // 4. Policy files (RFC-1.0.1 §9, §13)
  // ------------------------------------------------------------------

  writes.push(
    writeFile(
      join(base, PATHS.POLICIES_DIR, "approval-gates.yaml"),
      APPROVAL_GATES_YAML,
    ),
    writeFile(
      join(base, PATHS.POLICIES_DIR, "channel-policy.yaml"),
      CHANNEL_POLICY_YAML,
    ),
    writeFile(
      join(base, PATHS.POLICIES_DIR, "redaction.yaml"),
      REDACTION_YAML,
    ),
    writeFile(
      join(base, PATHS.POLICIES_DIR, "security-rules.yaml"),
      SECURITY_RULES_YAML,
    ),
  );

  // ------------------------------------------------------------------
  // 5. .gitignore
  // ------------------------------------------------------------------

  writes.push(
    writeFile(
      join(base, ".gitignore"),
      GITIGNORE,
    ),
  );

  await Promise.all(writes);
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

function personaYaml(
  agentId: string,
  displayName: string,
  cliTool: string,
): string {
  return `# Agent persona \u2014 ${agentId}
agent_id: "${agentId}"
display_name: "${displayName}"
cli_tool: "${cliTool}"
roles:
  - planner
  - implementer
  - reviewer
self_edit: false
propose_changes: true
approval_required: true
`;
}

function recallPolicyYaml(agentId: string): string {
  return `# Recall policy \u2014 ${agentId}
retrieval:
  vector_weight: 0.7
  bm25_weight: 0.3
  min_score: 0.35
  max_results: 20
auto_recall:
  on_task_assign: true
  on_handoff_receive: true
`;
}

function modeMd(mode: string): string {
  return `# MODE.md \u2014 Conitens Operating Mode

## Current Mode: ${mode}

### Provider Bindings
planner: claude
implementer: codex
reviewer: gemini
validator: claude

### Active Channels
- cli

### Approval Policy
default: auto_approve
high_risk: human_approval

### UI Defaults
theme: dark
refresh_interval: 5000
`;
}

// ---------------------------------------------------------------------------
// Static policy content (RFC-1.0.1 §9, §13)
// ---------------------------------------------------------------------------

const APPROVAL_GATES_YAML = `gates:
  - action: shell_execute
    risk_levels:
      low: auto_approve
      medium: log_and_approve
      high: human_approval
    high_patterns:
      - "rm -rf"
      - "DROP TABLE"
      - "curl"
      - "wget"
      - "ssh"
  - action: file_write
    rules:
      - path_glob: "src/**"
        approval: auto_approve
      - path_glob: ".env*"
        approval: human_approval
      - path_glob: ".conitens/policies/**"
        approval: human_approval
  - action: channel_send
    rules:
      - contains_code: true
        approval: human_approval
      - contains_secrets: true
        approval: deny
      - default: auto_approve
  - action: task_complete
    approval: validator_required
  - action: persona_change
    approval: human_approval
  - action: memory_curate
    approval: human_review
`;

const CHANNEL_POLICY_YAML = `channels:
  cli:
    enabled: true
    rate_limit: null
  slack:
    enabled: false
    socket_mode: true
  telegram:
    enabled: false
  discord:
    enabled: false
default_channel: cli
`;

const REDACTION_YAML = `patterns:
  - name: api_key
    regex: '(?i)(api[_-]?key|apikey|api[_-]?token)\\s*[:=]\\s*["'']?([a-zA-Z0-9_\\-]{20,})'
    replacement: "$1=<REDACTED>"
  - name: bearer_token
    regex: '(?i)bearer\\s+[a-zA-Z0-9_\\-\\.]{20,}'
    replacement: "Bearer <REDACTED>"
  - name: env_secret
    regex: '(?i)(SECRET|PASSWORD|TOKEN|PRIVATE_KEY)\\s*[:=]\\s*["'']?([^\\s"'']{8,})'
    replacement: "$1=<REDACTED>"
  - name: connection_string
    regex: '(?i)(postgres|mysql|mongodb|redis)://[^\\s"'']{10,}'
    replacement: "<REDACTED_CONNECTION_STRING>"
  - name: private_key_block
    regex: '-----BEGIN\\s+(RSA\\s+)?PRIVATE KEY-----[\\s\\S]*?-----END'
    replacement: "<REDACTED_PRIVATE_KEY>"
retain_originals: false
`;

const SECURITY_RULES_YAML = `rules:
  - name: no_secret_in_events
    check: redaction_applied
    severity: error
  - name: no_direct_entity_write
    check: writer_ownership
    severity: error
  - name: valid_state_transitions
    check: transition_rules
    severity: error
  - name: toctou_hash_binding
    check: approval_hash_match
    severity: error
`;

const GITIGNORE = `# Conitens runtime \u2014 not tracked
.conitens/runtime/
.conitens/agents/*/memory.sqlite
`;
