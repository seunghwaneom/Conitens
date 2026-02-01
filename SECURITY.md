# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 4.2.x   | ✅ Current         |
| 4.1.x   | ✅ Security fixes  |
| 4.0.x   | ⚠️ Critical only   |
| < 4.0   | ❌ Not supported   |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Email the maintainer directly with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution Timeline**: Depends on severity
  - Critical: 24-72 hours
  - High: 1-2 weeks
  - Medium: 2-4 weeks
  - Low: Next release

### Security Measures in Ensemble

#### File System Safety

- All file operations are scoped to workspace
- Lock files prevent concurrent access
- Stale lock cleanup prevents orphaned locks
- Atomic writes for critical files (`_registry.json`, `_locks.json`)

#### Approval System

- 3-tier approval: AUTO-APPROVE / GUARD / ASK
- Dangerous operations require explicit approval
- Owner authentication for sensitive commands

#### Data Handling

- No external data transmission
- All state stored locally in `.notes/`
- Error logs sanitized (paths masked)

### Known Limitations

1. **File Locks**: Not reliable on network drives (NFS) or Windows drives in WSL2
2. **Python Execution**: Commands are passed to shell; sanitize inputs
3. **Agent Trust**: AI agents can request file modifications; review before approval
4. **Owner System**: File-based ownership is a convenience feature, not a security mechanism
5. **Path Traversal**: Symlink-based escapes are not fully prevented (use WORKSPACE_POLICY)

### Security Boundaries

ENSEMBLE operates with the following security model:

| Boundary | Trust Level | Notes |
|----------|-------------|-------|
| Local filesystem | Full trust | User's machine |
| AI service APIs | External | Subject to their TOS |
| Git operations | User credentials | Uses local git config |
| Network | None | No outbound except AI APIs |

**ENSEMBLE does not:**
- Send telemetry or analytics
- Store API keys or credentials
- Connect to external servers (except AI services)
- Execute arbitrary network requests

### Security Best Practices

When using Ensemble:

1. **Review workspace policy** before starting
   ```bash
   cat .notes/WORKSPACE_POLICY.json
   ```

2. **Set write roots** appropriately
   ```json
   {
     "write_roots": ["src/", "tests/"],
     "data_roots": ["data/"]
   }
   ```

3. **Use GUARD mode** for unknown operations
   ```bash
   # Check pending approvals
   ensemble status --questions
   ```

4. **Verify before close**
   ```bash
   ensemble verify --files <modified-files>
   ```

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers in our release notes (with permission).
