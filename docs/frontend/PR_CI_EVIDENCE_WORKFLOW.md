# PR/CI Evidence Workflow

Status: `implemented`

This guide documents the local, review-gated PR/CI evidence flow for the
forward operator surface. It is intentionally file-based. Conitens does not
fetch from GitHub or CI, does not run provider auth commands, and does not
mutate tasks while importing evidence.

## What This Flow Does

- Converts local GitHub PR / GitHub Actions export JSON into reviewed evidence
  metadata.
- Lets an operator inspect and edit the sanitized metadata before append.
- Appends bounded `pr.evidence_observed` and `ci.evidence_observed` events only
  when the operator explicitly runs the append command.
- Shows appended evidence in operator task detail through the existing
  `pr_ci_evidence` projection.

## What This Flow Does Not Do

- No live GitHub or CI API fetch.
- No provider auth command execution.
- No environment dump.
- No raw PR bodies, comments, reviews, diffs, patches, logs, or token fields.
- No auto-merge.
- No unattended resume.
- No task status mutation or periodic resync.

## Required Inputs

- A canonical operator task id such as `otask-...`.
- A local GitHub / CI export JSON file.
- Optional `--run-id` if the evidence should be tied to a specific run.
- Optional `--repository` if the export does not include a repository label.

If `--run-id` is supplied and the task already has a linked run, the ids must
match. If `--run-id` is omitted, Conitens inherits the task's linked run id when
one exists.

## Step 1: Export Metadata Locally

Use any trusted local process to create a JSON export. The commands below are
examples only; they are not run by Conitens.

```powershell
gh pr view 42 --json number,id,title,state,url,headRefName,headRefOid,baseRefName,updatedAt > output/pr-42.json
gh run list --json databaseId,name,displayTitle,status,conclusion,url,headBranch,headSha,updatedAt --limit 5 > output/runs.json
```

Keep raw logs, PR bodies, comments, reviews, diffs, patches, and tokens out of
the export whenever possible. The importer also omits those fields if they are
present in a local source file.

## Step 2: Prepare Reviewed Evidence

Convert the local export into append-compatible reviewed metadata:

```powershell
python scripts/ensemble.py --workspace . forward import-pr-ci-evidence `
  --input output/github-export.json `
  --task-id otask-example `
  --format json > output/pr-ci-reviewed.json
```

The command is read-only. It does not append events.

The output shape is:

```json
{
  "kind": "forward_pr_ci_evidence_import",
  "status": "ok",
  "counts": {
    "total": 2,
    "pull_requests": 1,
    "ci_runs": 1
  },
  "items": []
}
```

Review `items` before the next step. URLs are sanitized before output:
credentials, query strings, and fragments are removed.

## Step 3: Append Reviewed Evidence

After review, append the prepared `items` to the event log:

```powershell
python scripts/ensemble.py --workspace . forward append-pr-ci-evidence `
  --input output/pr-ci-reviewed.json `
  --format json `
  --reviewer local/operator
```

This is the explicit mutating step. It appends only bounded PR/CI evidence
events. The command validates the whole input batch before writing, so rejected
input does not leave partial PR/CI events behind.

## Step 4: Confirm Task Detail

Start the forward bridge and open the dashboard task detail, or inspect the
task-detail payload through the bridge. The task detail projection now includes
`pr_ci_evidence` with posture, counts, suggestions, privacy metadata, and
bounded rows.

Evidence is matched by `task_id` first. If the task has a linked run, evidence
with that `run_id` is also included.

## Supported Local Export Shapes

The importer accepts:

- A single JSON object.
- A JSON array.
- An object with `items`.
- Common GitHub wrapper fields: `pull_request`, `workflow_runs`, `runs`,
  `check_runs`.

Common PR fields:

- `number`, `id`, `title`, `state`, `url`, `html_url`
- `headRefName`, `headRefOid`, `baseRefName`
- `head.ref`, `head.sha`, `head.repo.full_name`
- `updatedAt`, `updated_at`

Common CI fields:

- `databaseId`, `id`, `run_number`
- `name`, `workflowName`, `workflow_name`, `displayTitle`
- `status`, `conclusion`
- `url`, `html_url`
- `headBranch`, `head_branch`, `headSha`, `head_sha`
- `updatedAt`, `updated_at`, `run_started_at`

## Privacy And Safety Checks

Both import and append paths enforce the same boundary:

- `external_fetch_performed` is `false`.
- `auth_commands_executed` is `false`.
- raw external content is not retained.
- URL query strings and fragments are not retained.
- token-like strings inside retained metadata values are redacted before CLI
  review output or append summaries are returned.
- appended events use only bounded metadata.

The append path rejects unknown fields and raw-content key variants such as
`raw_log`, `rawLog`, `reviewBody`, `diff`, `patch`, `comment`, `token`, and
`authToken`.

When value redaction occurs, CLI JSON includes
`privacy.metadata_redaction_applied` and `privacy.metadata_redaction_rules`.

## Troubleshooting

`Operator task not found`

The supplied `--task-id` must already exist in canonical operator task storage.

`run_id does not match task`

The task already has a linked run. Use the matching run id or omit `--run-id`.

`unsupported fields`

The append input contains fields outside the reviewed evidence contract. Remove
the unsupported keys or regenerate the file with `import-pr-ci-evidence`.

`forbids raw external content fields`

The append input contains raw logs, diffs, patches, body/comment/review text, or
token-like fields. Remove those fields before appending.
