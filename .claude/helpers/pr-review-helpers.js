/**
 * PR Review Helpers for Shared Memory MCP
 *
 * Utility functions for PR review workflow using shared-memory-mcp
 */

/**
 * Initialize PR review session
 *
 * @param {object} mcp - MCP client instance
 * @param {number} prNumber - PR number
 * @param {object} prInfo - PR metadata from gh pr view
 * @param {object} zones - Categorized files by zone
 * @returns {Promise<object>} Session info
 */
async function initializePRReviewSession(mcp, prNumber, prInfo, zones) {
  console.log(`🚀 Initializing PR review session for #${prNumber}...`);

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
    task_description: `Review PR #${prNumber}: ${prInfo.title}`,

    // Store full PR context once
    pr_metadata: {
      number: prNumber,
      title: prInfo.title,
      author: prInfo.author,
      files_changed: prInfo.files?.length || 0,
      additions: prInfo.additions,
      deletions: prInfo.deletions,
      url: `https://github.com/${prInfo.baseRepository}/pull/${prNumber}`
    },

    // Store zones with full content
    zones: zones,

    requirements: [
      'Find BLOCKERS, CRITICAL, MAJOR, IMPROVEMENT issues',
      'Return findings in JSON format with file:line references',
      'Include specific fix suggestions',
      'Follow severity criteria from PR-REVIEW-KNOWLEDGE.md'
    ]
  });

  console.log(`✅ Session created: ${session.session_id}`);
  return session;
}

/**
 * Create work units for PR review
 *
 * @param {object} mcp - MCP client instance
 * @param {string} sessionId - Session ID
 * @param {object} zones - Zone information
 * @returns {Promise<Array>} Work units created
 */
async function createPRWorkUnits(mcp, sessionId, zones) {
  console.log('📋 Creating work units...');

  const workUnits = [];

  // Test zone
  if (zones.test?.files?.length > 0) {
    workUnits.push({
      unit_id: 'review-tests',
      type: 'testing',
      zone: 'test',
      priority: 'high',
      assigned_to: 'pr-test-reviewer',
      files_count: zones.test.files.length
    });
  }

  // Auth/Security zone
  if (zones.auth?.files?.length > 0) {
    workUnits.push({
      unit_id: 'review-security',
      type: 'security',
      zone: 'auth',
      priority: 'critical',
      assigned_to: 'pr-security-reviewer',
      files_count: zones.auth.files.length
    });
  }

  // Database zone
  if (zones.database?.files?.length > 0) {
    workUnits.push({
      unit_id: 'review-database',
      type: 'database',
      zone: 'database',
      priority: 'high',
      assigned_to: 'pr-database-reviewer',
      files_count: zones.database.files.length
    });
  }

  // Backend code zone
  if (zones.backend?.files?.length > 0) {
    workUnits.push({
      unit_id: 'review-code-quality',
      type: 'code-quality',
      zone: 'backend',
      priority: 'medium',
      assigned_to: 'pr-code-quality-reviewer',
      files_count: zones.backend.files.length
    });
  }

  // Performance zone
  if (zones.performance?.files?.length > 0) {
    workUnits.push({
      unit_id: 'review-performance',
      type: 'performance',
      zone: 'performance',
      priority: 'medium',
      assigned_to: 'pr-performance-reviewer',
      files_count: zones.performance.files.length
    });
  }

  // Documentation zone
  if (zones.docs?.files?.length > 0) {
    workUnits.push({
      unit_id: 'review-docs',
      type: 'documentation',
      zone: 'docs',
      priority: 'low',
      assigned_to: 'pr-docs-reviewer',
      files_count: zones.docs.files.length
    });
  }

  if (workUnits.length === 0) {
    throw new Error('No work units created - no relevant files found');
  }

  await mcp.callTool('publish_work_units', {
    session_id: sessionId,
    work_units: workUnits
  });

  console.log(`✅ Created ${workUnits.length} work units`);
  return workUnits;
}

/**
 * Categorize PR files into zones
 *
 * @param {Array} files - List of file paths from PR
 * @param {object} fileContents - Map of file path to content
 * @returns {object} Zones with files and context
 */
function categorizePRFiles(files, fileContents) {
  console.log(`📂 Categorizing ${files.length} files into zones...`);

  const zones = {
    test: { files: [], context: {}, focus: 'Test coverage, AAA pattern, mocking, edge cases' },
    auth: { files: [], context: {}, focus: 'Security vulnerabilities, auth flow, XSS, CSRF' },
    database: { files: [], context: {}, focus: 'Query optimization, indexes, migrations, N+1' },
    backend: { files: [], context: {}, focus: 'Code quality, TypeScript, architecture, patterns' },
    performance: { files: [], context: {}, focus: 'Bottlenecks, memory usage, complexity' },
    frontend: { files: [], context: {}, focus: 'React best practices, state management, UX' },
    docs: { files: [], context: {}, focus: 'Documentation completeness, clarity, accuracy' }
  };

  for (const file of files) {
    const content = fileContents[file] || '';

    // Test files
    if (file.match(/\.(spec|test)\.(ts|js|tsx|jsx)$/i) || file.includes('/test/')) {
      zones.test.files.push(file);
      zones.test.context[file] = content;
    }

    // Auth/Security files
    if (file.match(/(auth|guard|login|session|jwt|token|password|crypto)/i)) {
      zones.auth.files.push(file);
      zones.auth.context[file] = content;
    }

    // Database files
    if (file.match(/(schema\.prisma|migration|\.sql)/i) ||
        content.includes('prisma.') ||
        content.includes('@prisma/client')) {
      zones.database.files.push(file);
      zones.database.context[file] = content;
    }

    // Backend files
    if (file.match(/\.(service|controller|processor|module)\.(ts|js)$/i) &&
        !file.includes('.spec.')) {
      zones.backend.files.push(file);
      zones.backend.context[file] = content;
    }

    // Frontend files
    if (file.match(/\.(tsx|jsx)$/i) &&
        (file.includes('components/') ||
         file.includes('pages/') ||
         file.includes('src/'))) {
      zones.frontend.files.push(file);
      zones.frontend.context[file] = content;
    }

    // Documentation files
    if (file.match(/\.(md|mdx)$/i) || file.includes('docs/')) {
      zones.docs.files.push(file);
      zones.docs.context[file] = content;
    }

    // Performance-critical patterns
    if (content.match(/for\s*\([^)]*\)\s*\{[\s\S]*await/gm) || // loops with await
        content.match(/while\s*\([^)]*\)\s*\{[\s\S]*await/gm) ||
        content.match(/\.map\([^)]*\)\s*\.map/gm) || // nested maps
        content.match(/findMany|findUnique|findFirst/gm)) { // database queries
      zones.performance.files.push(file);
      zones.performance.context[file] = content;
    }
  }

  // Remove duplicates
  for (const zone in zones) {
    zones[zone].files = [...new Set(zones[zone].files)];
  }

  // Remove empty zones
  for (const zone in zones) {
    if (zones[zone].files.length === 0) {
      delete zones[zone];
    }
  }

  console.log('📊 Zone breakdown:');
  for (const zone in zones) {
    console.log(`  - ${zone}: ${zones[zone].files.length} files`);
  }

  return zones;
}

/**
 * Publish a finding as a discovery
 *
 * @param {object} mcp - MCP client instance
 * @param {string} sessionId - Session ID
 * @param {string} workerId - Worker ID
 * @param {object} finding - Finding object
 * @returns {Promise<void>}
 */
async function publishFinding(mcp, sessionId, workerId, finding) {
  await mcp.callTool('add_discovery', {
    session_id: sessionId,
    worker_id: workerId,
    discovery_type: finding.severity.toLowerCase(),
    data: finding,
    affects_workers: finding.severity === 'BLOCKER' ? [] : undefined
  });
}

/**
 * Aggregate all findings from workers
 *
 * @param {object} mcp - MCP client instance
 * @param {string} sessionId - Session ID
 * @returns {Promise<object>} Aggregated findings
 */
async function aggregateFindings(mcp, sessionId) {
  console.log('📊 Aggregating findings from all workers...');

  const discoveries = await mcp.callTool('get_discoveries_since', {
    session_id: sessionId,
    since_version: 0
  });

  const aggregated = {
    blockers: [],
    critical: [],
    major: [],
    improvements: []
  };

  for (const discovery of discoveries.discoveries || []) {
    const severity = discovery.discovery_type.toUpperCase();

    if (severity === 'BLOCKER' && aggregated.blockers) {
      aggregated.blockers.push(discovery.data);
    } else if (severity === 'CRITICAL' && aggregated.critical) {
      aggregated.critical.push(discovery.data);
    } else if (severity === 'MAJOR' && aggregated.major) {
      aggregated.major.push(discovery.data);
    } else if (severity === 'IMPROVEMENT' && aggregated.improvements) {
      aggregated.improvements.push(discovery.data);
    }
  }

  console.log(`✅ Aggregated findings:`);
  console.log(`  - Blockers: ${aggregated.blockers.length}`);
  console.log(`  - Critical: ${aggregated.critical.length}`);
  console.log(`  - Major: ${aggregated.major.length}`);
  console.log(`  - Improvements: ${aggregated.improvements.length}`);

  return aggregated;
}

/**
 * Calculate overall score from worker summaries
 *
 * @param {Array} workerSummaries - Array of worker summary objects
 * @returns {number} Overall score (0-10)
 */
function calculateOverallScore(workerSummaries) {
  if (!workerSummaries || workerSummaries.length === 0) {
    return 0;
  }

  const scores = workerSummaries
    .map(s => s.score)
    .filter(s => typeof s === 'number' && !isNaN(s));

  if (scores.length === 0) {
    return 0;
  }

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(average * 10) / 10; // Round to 1 decimal
}

/**
 * Format final PR review report
 *
 * @param {object} params - Report parameters
 * @returns {object} Formatted report
 */
function formatPRReviewReport({
  prNumber,
  prTitle,
  overallScore,
  findings,
  workerSummaries,
  tokenUsage,
  zonesAnalyzed
}) {
  const status = findings.blockers.length > 0
    ? 'CHANGES_REQUESTED'
    : findings.critical.length > 0
      ? 'REVIEW_REQUIRED'
      : 'APPROVED';

  const topIssues = [
    ...findings.blockers.slice(0, 3).map(f => ({ ...f, severity: 'BLOCKER' })),
    ...findings.critical.slice(0, 3).map(f => ({ ...f, severity: 'CRITICAL' }))
  ].slice(0, 5);

  return {
    pr_number: prNumber,
    pr_title: prTitle,
    overall_score: overallScore,
    status: status,

    summary: {
      total_findings: findings.blockers.length + findings.critical.length +
                     findings.major.length + findings.improvements.length,
      blockers: findings.blockers.length,
      critical: findings.critical.length,
      major: findings.major.length,
      improvements: findings.improvements.length
    },

    top_issues: topIssues.map(issue => ({
      severity: issue.severity,
      title: issue.title,
      file: issue.file,
      line: issue.line,
      fix: issue.fix
    })),

    workers: workerSummaries.map(w => ({
      name: w.worker_id,
      score: w.score,
      zone: w.zone,
      files_reviewed: w.files_count,
      findings: w.findings_summary
    })),

    zones_analyzed: zonesAnalyzed,

    token_usage: tokenUsage,

    recommendations: [
      ...findings.blockers.map(f => `🔴 ${f.title} (${f.file}:${f.line})`),
      ...findings.critical.slice(0, 3).map(f => `🟠 ${f.title} (${f.file}:${f.line})`)
    ]
  };
}

module.exports = {
  initializePRReviewSession,
  createPRWorkUnits,
  categorizePRFiles,
  publishFinding,
  aggregateFindings,
  calculateOverallScore,
  formatPRReviewReport
};
