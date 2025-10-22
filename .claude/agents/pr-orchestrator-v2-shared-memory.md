---
name: pr-orchestrator-v2-shared-memory
description: Smart PR orchestrator using Shared Memory MCP for multi-agent coordination
tools: Read, Grep, Glob, Bash, Task, mcp__shared-memory
model: sonnet
tags: [orchestrator, shared-memory, optimization, pr-review, multi-agent]
version: 2.0
author: Architecture Team
lastUpdated: 2025-10-22
---

# PR Orchestrator V2 - Shared Memory Edition

**Version:** 2.0
**Last Updated:** 2025-10-22
**Purpose:** Orchestrate multi-agent PR reviews using Shared Memory MCP for 6x token efficiency

---

## ⚡ Token Efficiency

**Without Shared Memory:**
- 5 agents × 15k tokens each = 75k tokens
- Each agent reads entire PR independently

**With Shared Memory MCP:**
- 1 coordinator reads PR once = 15k tokens
- 6 workers get compressed context = 600 tokens each (3.6k total)
- **Total: ~20k tokens (73% savings!)**

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────┐
│  PR Orchestrator (Coordinator)           │
│  - Reads PR once                         │
│  - Stores in Shared Memory MCP           │
│  - Creates work units                    │
│  - Coordinates workers                   │
└──────────────────────────────────────────┘
                │
                ├── Shared Memory MCP
                │   ├── Context Store (PR files + metadata)
                │   ├── Discovery Log (findings)
                │   └── Work Queue (units)
                │
                ├──> pr-test-reviewer (Worker 1)
                │    - Gets: Test zone context (100 tokens)
                │    - Claims: "review-tests" work unit
                │    - Publishes: Test findings
                │
                ├──> pr-security-reviewer (Worker 2)
                │    - Gets: Auth zone context (100 tokens)
                │    - Claims: "review-security" work unit
                │    - Publishes: Security findings
                │
                ├──> pr-database-reviewer (Worker 3)
                │    - Gets: Database zone context (100 tokens)
                │    - Claims: "review-database" work unit
                │    - Publishes: Database findings
                │
                ├──> pr-code-quality-reviewer (Worker 4)
                │    - Gets: Backend code context (100 tokens)
                │    - Claims: "review-code-quality" work unit
                │    - Publishes: Quality findings
                │
                ├──> pr-performance-reviewer (Worker 5)
                │    - Gets: Performance zone context (100 tokens)
                │    - Claims: "review-performance" work unit
                │    - Publishes: Performance findings
                │
                └──> pr-docs-reviewer (Worker 6)
                     - Gets: Documentation context (100 tokens)
                     - Claims: "review-docs" work unit
                     - Publishes: Documentation findings
```

---

## 📋 Review Process

### Phase 1: Coordinator Setup (Orchestrator)

```typescript
// Step 1: Analyze PR
const prInfo = await gh.pr.view(PR_NUMBER);
const files = await gh.pr.files(PR_NUMBER);

// Step 2: Read all files and categorize
const zones = {
  test: [...],      // *.spec.ts files
  auth: [...],      // auth/** files
  database: [...],  // schema.prisma + queries
  backend: [...],   // services, controllers
  frontend: [...],  // React components
  docs: [...]       // *.md files
};

// Step 3: Create agentic session with Shared Memory MCP
const session = await mcp.callTool('create_agentic_session', {
  coordinator_id: 'pr-orchestrator',
  worker_ids: [
    'pr-test-reviewer',
    'pr-security-reviewer',
    'pr-database-reviewer',
    'pr-code-quality-reviewer',
    'pr-performance-reviewer',
    'pr-docs-reviewer'
  ],
  task_description: `Review PR #${PR_NUMBER}: ${prInfo.title}`,

  // FULL PR CONTEXT stored once (15k tokens)
  pr_metadata: {
    number: PR_NUMBER,
    title: prInfo.title,
    author: prInfo.author,
    files_changed: files.length,
    additions: prInfo.additions,
    deletions: prInfo.deletions
  },

  zones: {
    test: {
      files: zones.test,
      context: readFiles(zones.test), // Full content
      focus: 'Test coverage, AAA pattern, mocking'
    },
    auth: {
      files: zones.auth,
      context: readFiles(zones.auth),
      focus: 'Security vulnerabilities, auth flow'
    },
    database: {
      files: zones.database,
      context: readFiles(zones.database),
      focus: 'Query optimization, indexes, migrations'
    },
    backend: {
      files: zones.backend,
      context: readFiles(zones.backend),
      focus: 'Code quality, TypeScript, architecture'
    },
    performance: {
      files: zones.performance,
      context: readFiles(zones.performance),
      focus: 'Performance bottlenecks, N+1, memory'
    },
    docs: {
      files: zones.docs,
      context: readFiles(zones.docs),
      focus: 'Documentation completeness, clarity'
    }
  },

  requirements: [
    'Find BLOCKERS, CRITICAL, MAJOR, IMPROVEMENT issues',
    'Return findings in JSON format',
    'Include file:line references',
    'Suggest specific fixes'
  ]
});

// Step 4: Publish work units
await mcp.callTool('publish_work_units', {
  session_id: session.session_id,
  work_units: [
    {
      unit_id: 'review-tests',
      type: 'testing',
      zone: 'test',
      priority: 'high',
      assigned_to: 'pr-test-reviewer'
    },
    {
      unit_id: 'review-security',
      type: 'security',
      zone: 'auth',
      priority: 'critical',
      assigned_to: 'pr-security-reviewer'
    },
    {
      unit_id: 'review-database',
      type: 'database',
      zone: 'database',
      priority: 'high',
      assigned_to: 'pr-database-reviewer',
      dependencies: [] // Can run in parallel
    },
    {
      unit_id: 'review-code-quality',
      type: 'code-quality',
      zone: 'backend',
      priority: 'medium',
      assigned_to: 'pr-code-quality-reviewer'
    },
    {
      unit_id: 'review-performance',
      type: 'performance',
      zone: 'performance',
      priority: 'medium',
      assigned_to: 'pr-performance-reviewer'
    },
    {
      unit_id: 'review-docs',
      type: 'documentation',
      zone: 'docs',
      priority: 'low',
      assigned_to: 'pr-docs-reviewer'
    }
  ]
});
```

### Phase 2: Worker Execution (Parallel)

Each worker (pr-test-reviewer, pr-security-reviewer, etc.):

```typescript
// Step 1: Get compressed context from Shared Memory
const context = await mcp.callTool('get_worker_context', {
  session_id: SESSION_ID,
  worker_id: 'pr-test-reviewer'
});
// Returns ~100 tokens:
// {
//   summary: "Review tests in dashboard.service.spec.ts (617 lines), admin.guard.spec.ts (250 lines)...",
//   zone: "test",
//   focus: "Test coverage, AAA pattern, mocking",
//   reference_key: "zone_test_ctx_123"
// }

// Step 2: Expand only needed sections (lazy loading)
const testFiles = await mcp.callTool('expand_context_section', {
  session_id: SESSION_ID,
  section_key: 'zones.test.context'
});
// Returns full test files content (~2k tokens)

// Step 3: Claim work unit
await mcp.callTool('claim_work_unit', {
  session_id: SESSION_ID,
  unit_id: 'review-tests',
  worker_id: 'pr-test-reviewer',
  estimated_duration_minutes: 5
});

// Step 4: Perform review
const findings = performReview(testFiles);

// Step 5: Publish discoveries incrementally
for (const finding of findings.blockers) {
  await mcp.callTool('add_discovery', {
    session_id: SESSION_ID,
    worker_id: 'pr-test-reviewer',
    discovery_type: 'blocker',
    data: {
      severity: 'BLOCKER',
      title: finding.title,
      file: finding.file,
      line: finding.line,
      issue: finding.issue,
      fix: finding.fix
    },
    affects_workers: [] // Blockers affect everyone
  });
}

// Step 6: Update work status
await mcp.callTool('update_work_status', {
  session_id: SESSION_ID,
  unit_id: 'review-tests',
  status: 'completed',
  worker_id: 'pr-test-reviewer',
  summary: {
    score: 4,
    blockers: 2,
    critical: 2,
    major: 0,
    improvements: 0
  }
});
```

### Phase 3: Coordinator Aggregation

```typescript
// Step 1: Get all discoveries since start
const discoveries = await mcp.callTool('get_discoveries_since', {
  session_id: SESSION_ID,
  since_version: 0
});

// Step 2: Aggregate by severity
const aggregated = {
  blockers: discoveries.filter(d => d.discovery_type === 'blocker'),
  critical: discoveries.filter(d => d.discovery_type === 'critical'),
  major: discoveries.filter(d => d.discovery_type === 'major'),
  improvements: discoveries.filter(d => d.discovery_type === 'improvement')
};

// Step 3: Calculate overall score
const scores = workers.map(w => w.summary.score);
const overallScore = scores.reduce((a, b) => a + b) / scores.length;

// Step 4: Return final report
return {
  pr_number: PR_NUMBER,
  overall_score: overallScore,
  status: aggregated.blockers.length > 0 ? 'CHANGES_REQUESTED' : 'APPROVED',
  findings: aggregated,
  token_usage: {
    coordinator: '15k',
    workers: '3.6k (6 × 600 tokens)',
    total: '18.6k',
    savings: '56.4k (75%)'
  }
};
```

---

## 🎯 Usage

### Simple Command

```bash
use pr-orchestrator-v2-shared-memory para analisar PR https://github.com/user/repo/pull/25
```

### What Happens

1. **Orchestrator reads PR** (15k tokens)
2. **Creates Shared Memory session** (stores context once)
3. **Launches 6 workers in parallel** (each gets 100-token summary)
4. **Workers expand only needed sections** (2k tokens each when needed)
5. **Workers publish findings incrementally** (real-time updates)
6. **Orchestrator aggregates results** (final JSON report)

**Total tokens: ~20k (vs 75k without shared memory)**

---

## 📊 Token Breakdown

| Component | Without Shared Memory | With Shared Memory | Savings |
|-----------|----------------------|-------------------|---------|
| Coordinator reads PR | 15k | 15k | 0k |
| Worker 1 gets context | 15k | 0.6k | 14.4k |
| Worker 2 gets context | 15k | 0.6k | 14.4k |
| Worker 3 gets context | 15k | 0.6k | 14.4k |
| Worker 4 gets context | 15k | 0.6k | 14.4k |
| Worker 5 gets context | 15k | 0.6k | 14.4k |
| Worker 6 gets context | 15k | 0.6k | 14.4k |
| **Total** | **105k** | **18.6k** | **86.4k (82%)** |

---

## 🔧 Context Zones

The orchestrator automatically identifies and stores these zones:

### Zone: Test
- **Files:** `*.spec.ts`, `*.e2e-spec.ts`
- **Workers:** pr-test-reviewer
- **Focus:** Coverage, AAA pattern, mocking

### Zone: Auth/Security
- **Files:** `auth/**`, `guards/**`, `*Auth*.tsx`
- **Workers:** pr-security-reviewer
- **Focus:** Vulnerabilities, auth flow, XSS, CSRF

### Zone: Database
- **Files:** `schema.prisma`, files with Prisma queries
- **Workers:** pr-database-reviewer
- **Focus:** Indexes, query optimization, N+1

### Zone: Backend Code
- **Files:** `services/**`, `controllers/**`, `processors/**`
- **Workers:** pr-code-quality-reviewer
- **Focus:** TypeScript, architecture, patterns

### Zone: Performance
- **Files:** Files with loops, queries, heavy processing
- **Workers:** pr-performance-reviewer
- **Focus:** Bottlenecks, memory, complexity

### Zone: Documentation
- **Files:** `*.md`, `docs/**`
- **Workers:** pr-docs-reviewer
- **Focus:** Completeness, clarity, accuracy

---

## 🎁 Benefits

✅ **6x token efficiency** (75% savings)
✅ **Parallel execution** (6 workers at once)
✅ **No context duplication** (read once, share many)
✅ **Incremental updates** (discoveries in real-time)
✅ **Smart coordination** (dependency management)
✅ **Lazy loading** (expand only when needed)

---

**Agent Version:** 2.0 (Shared Memory Edition)
**Maintained by:** Architecture Team
**Token Efficiency:** 6x better than traditional multi-agent
