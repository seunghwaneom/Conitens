# Contributing to Conitens

Thank you for your interest in contributing to Conitens! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Agent-Assisted Contributions](#agent-assisted-contributions)

---

## Code of Conduct

This project adheres to our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## How Can I Contribute?

### 🐛 Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
3. Include:
   - Ensemble version (`ensemble --version`)
   - OS and environment
   - Steps to reproduce
   - Expected vs actual behavior
   - Relevant logs

**Pro tip**: Use the agent-assisted reporter:
```bash
ensemble report --type bug
```

### ✨ Suggesting Features

1. Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)
2. Describe the problem you're trying to solve
3. Propose your solution
4. Consider alternatives

### 📈 Upgrade Suggestions

For improvements based on your usage experience:
```bash
ensemble report --type suggestion
```

Or use the [Upgrade Suggestion template](.github/ISSUE_TEMPLATE/upgrade_suggestion.md).

### 🔧 Code Contributions

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a Pull Request

---

## Development Setup

### Prerequisites

- Node.js ≥ 16.0.0
- Python ≥ 3.8
- Git

### Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/ensemble.git
cd ensemble

# Install dependencies
npm install

# Link for local testing
npm link

# Run tests
npm test

# Test CLI
ensemble --help
```

### Project Structure

```
ensemble/
├── bin/
│   ├── ensemble.js      # CLI entry point
│   └── postinstall.js   # Post-install script
├── scripts/
│   ├── ensemble.py      # Main Python CLI (4000+ lines)
│   └── ensemble_*.py    # Feature modules
├── .agent/              # Agent configurations
├── .vibe/               # Vibe-kit integration
├── vibe-kit/            # Context management tools
├── docs/                # Documentation
└── tests/               # Test files
```

---

## Coding Standards

### Python (scripts/)

```python
# Follow PEP 8
# Use type hints where practical
def cmd_new(args: argparse.Namespace) -> None:
    """Create a new task.
    
    Args:
        args: Parsed command-line arguments
    """
    pass

# Docstrings for all public functions
# Error handling with informative messages
```

### JavaScript (bin/)

```javascript
// Use const/let, no var
// Shell-free execution (Node.js DEP0190 compliance)
// Cross-platform compatibility (Windows/macOS/Linux)
```

### Markdown (docs/)

- Use ATX-style headers (`#`, `##`, `###`)
- Include code examples with language hints
- Keep lines under 100 characters

---

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change, no feature/fix |
| `perf` | Performance improvement |
| `test` | Adding tests |
| `chore` | Build process, dependencies |

### Examples

```bash
feat(cli): add upgrade-scan command for journal analysis

fix(verify): handle Korean filenames in slugify

docs(readme): add installation troubleshooting section
```

### Scope Suggestions

- `cli` — Command-line interface
- `verify` — Verification system
- `lock` — File locking
- `error` — Error registry
- `agent` — Agent configuration
- `vibe` — Vibe-kit integration

---

## Pull Request Process

### Before Submitting

1. **Test your changes**
   ```bash
   # Run existing tests
   npm test
   
   # Test CLI manually
   ensemble new --mode GCC --case NEW_BUILD --title "Test PR"
   ensemble status
   ```

2. **Update documentation** if needed

3. **Update CHANGELOG.md** with your changes

4. **Ensure no breaking changes** (or document them clearly)

### PR Template

Your PR should include:

- [ ] Description of changes
- [ ] Link to related issue(s)
- [ ] Test steps
- [ ] Screenshots (if UI-related)
- [ ] Breaking changes noted

### Review Process

1. Maintainer reviews within 48-72 hours
2. Address feedback
3. Squash commits if requested
4. Merge upon approval

---

## Issue Guidelines

### Good Issue Title

```
❌ Bad:  "It doesn't work"
✅ Good: "ensemble verify fails on files with Korean characters"
```

### Minimum Information

For bugs:
- Ensemble version
- Python version
- OS and version
- Exact error message
- Steps to reproduce

For features:
- Use case description
- Proposed solution
- Alternative approaches considered

---

## Agent-Assisted Contributions

Ensemble supports AI-assisted development. When using AI agents:

### Allowed

✅ Using AI to write code that you review and understand  
✅ Using AI to generate tests  
✅ Using AI to improve documentation  
✅ Using `ensemble report` for issue creation  

### Required

⚠️ Disclose AI assistance in PR description  
⚠️ Review all AI-generated code before committing  
⚠️ Ensure AI-generated code passes all tests  

### Not Allowed

❌ Submitting unreviewed AI-generated code  
❌ Using AI to bypass contribution requirements  
❌ Automated PRs without human review  

---

## Recognition

Contributors are recognized in:

- [CHANGELOG.md](CHANGELOG.md) — For each release
- GitHub's contributors page
- Release notes for significant contributions

---

## Questions?

- Open a [Discussion](https://github.com/seunghwan/conitens/discussions)
- Check existing [Issues](https://github.com/seunghwan/conitens/issues)
- Read the [Documentation](docs/)

---

Thank you for contributing to Conitens! 🎼
