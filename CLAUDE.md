# CLAUDE.md

> Project-specific memory for Claude Code.

## Documentation Structure (BMAD v6)

### Quick Start
1. **First Task:** Read `project-context.md` - Critical AI agent rules and common pitfalls
2. **Deep Dive:** Read `AGENTS.md` - Complete project architecture and workflows
3. **Conflict Rule:** If anything conflicts, `AGENTS.md` wins (canonical source)

### File Roles
- **`project-context.md`** - Non-obvious implementation rules optimized for LLMs (BMAD v6 standard)
  - Configuration validation workflow
  - Service responsibility boundaries (SSOT)
  - Common pitfalls and quick solutions
- **`AGENTS.md`** - Authoritative project guide (architecture, commands, workflows, troubleshooting)
- **This file** - Quick reference and documentation pointer

## Memory & Context
- **Do NOT copy documentation into memory.** Read files only when needed.
- **Critical Rules:** See `project-context.md` for implementation rules AI agents commonly miss
- **Code Style:** Follow existing patterns. Run `make lint` to verify.
- **Troubleshooting:** See `AGENTS.md` -> "Troubleshooting & Known Issues"

## Pre-Implementation Checklist
- [ ] Read `project-context.md` for critical rules
- [ ] Check configuration validation workflow if adding config fields
- [ ] Verify service responsibilities (stateManager vs metadataService)
- [ ] Review logging levels (use `info` for production visibility)
- [ ] Run `make clean && make test && make lint` before commits
