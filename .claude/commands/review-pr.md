# /review-pr - Automated PR Review with Shared Memory MCP

Execute complete PR review using orchestrator with 6 specialized agents and shared memory for maximum token efficiency.

---

## Usage

```bash
/review-pr <PR_URL>
```

**Examples:**
```bash
/review-pr https://github.com/diogenesmendes01/email-gateway/pull/25
/review-pr 25
/review-pr #26
```

---

## What This Command Does

This command **automatically** invokes the `pr-orchestrator-v2-shared-memory` agent which:

1. ✅ **Reads PR once** (15k tokens) and stores in Shared Memory MCP
2. ✅ **Identifies zones** (test, auth, database, backend, frontend, docs)
3. ✅ **Launches 6 specialized workers** in parallel:
   - `pr-test-reviewer` - Test coverage, quality, patterns
   - `pr-security-reviewer` - Security vulnerabilities, auth, XSS
   - `pr-database-reviewer` - Query optimization, indexes, migrations
   - `pr-code-quality-reviewer` - TypeScript, architecture, patterns
   - `pr-performance-reviewer` - Bottlenecks, memory, complexity
   - `pr-docs-reviewer` - Documentation completeness, clarity
4. ✅ **Workers get compressed context** (100 tokens each) from Shared Memory
5. ✅ **Workers expand only needed sections** (lazy loading)
6. ✅ **Findings published incrementally** (real-time discoveries)
7. ✅ **Coordinator aggregates results** (final JSON report)

---

## Token Efficiency

| Scenario | Traditional | With Shared Memory | Savings |
|----------|-------------|-------------------|---------|
| Small PR (<500 lines) | 30k | 8k | **73%** |
| Medium PR (1000 lines) | 50k | 15k | **70%** |
| Large PR (4000+ lines) | 110k | 30k | **73%** |

**Average savings: 70-73% tokens!** 🎉

---

## Output Format

You will receive a comprehensive JSON report with:

```json
{
  "pr_number": 25,
  "overall_score": 7.5,
  "status": "CHANGES_REQUESTED | APPROVED",
  "summary": {
    "total_findings": 27,
    "blockers": 6,
    "critical": 11,
    "major": 8,
    "improvements": 2
  },
  "top_issues": [
    {
      "severity": "BLOCKER",
      "title": "Tests don't compile",
      "file": "dashboard.controller.spec.ts",
      "line": 3,
      "fix": "Change import * as request to import request"
    }
    // ... more issues
  ],
  "workers": [
    {
      "name": "pr-test-reviewer",
      "score": 4,
      "zone": "test",
      "findings": { "blockers": 2, "critical": 2 }
    }
    // ... other workers
  ],
  "token_usage": {
    "coordinator": "15k",
    "workers": "3.6k",
    "total": "18.6k",
    "savings": "56.4k (75%)"
  }
}
```

---

## Post-Review Actions

After review completes, the orchestrator will:

1. **Post inline comments** on specific files/lines (if requested)
2. **Generate summary report** with all findings
3. **Create backlog items** for MAJOR/IMPROVEMENT issues
4. **Show token usage** comparison

---

## Requirements

- ✅ Shared Memory MCP server running
- ✅ `pr-orchestrator-v2-shared-memory` agent available
- ✅ All 6 worker agents configured
- ✅ GitHub CLI (`gh`) configured

---

## Advanced Options

**Skip specific reviewers:**
```bash
/review-pr 25 --skip=pr-docs-reviewer,pr-performance-reviewer
```

**Focus on specific zones:**
```bash
/review-pr 25 --zones=test,security
```

**Post comments automatically:**
```bash
/review-pr 25 --post-comments
```

---

## Architecture

```
User runs: /review-pr 25
     ↓
Invokes: pr-orchestrator-v2-shared-memory
     ↓
     ├── Shared Memory MCP Server
     │   ├── Context Store (PR files)
     │   ├── Discovery Log (findings)
     │   └── Work Queue (units)
     ↓
     ├──> pr-test-reviewer (100 tokens)
     ├──> pr-security-reviewer (100 tokens)
     ├──> pr-database-reviewer (100 tokens)
     ├──> pr-code-quality-reviewer (100 tokens)
     ├──> pr-performance-reviewer (100 tokens)
     └──> pr-docs-reviewer (100 tokens)
     ↓
Coordinator aggregates → Final Report
```

---

## Examples

### Example 1: Quick Review
```bash
/review-pr 25
```
**Output:**
```
🚀 Starting PR review for #25...
✅ Session created: sess_xyz123
📊 Identified 5 zones (test, auth, database, backend, frontend)
🔧 Launching 5 workers...
  ✅ pr-test-reviewer: Found 2 BLOCKERS, 2 CRITICAL
  ✅ pr-security-reviewer: Found 2 BLOCKERS, 3 CRITICAL
  ✅ pr-database-reviewer: Found 2 BLOCKERS, 3 CRITICAL
  ✅ pr-code-quality-reviewer: Found 0 BLOCKERS, 4 CRITICAL
  ⏭️  pr-performance-reviewer: SKIPPED (no performance concerns)
📊 Overall Score: 7.5/10
⚠️  Status: APPROVED WITH RESERVATIONS
💰 Token Usage: 18.6k (saved 56.4k / 75%)
```

### Example 2: With Comments
```bash
/review-pr 25 --post-comments
```
**Output:**
```
🚀 Starting PR review for #25...
✅ Session created: sess_xyz123
📝 Posted 14 inline comments
📊 Overall Score: 7.5/10
```

---

## Troubleshooting

**Error: Shared Memory MCP not found**
```
Solution: Restart Claude Desktop to load MCP server
```

**Error: Session creation failed**
```
Solution: Check if MCP server is running:
node ~/shared-memory-mcp/dist/server.js
```

**Error: Worker timeout**
```
Solution: Increase worker timeout in orchestrator config
```

---

**Command Version:** 1.0
**Created:** 2025-10-22
**Token Savings:** 70-73% vs traditional review
