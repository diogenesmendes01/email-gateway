#!/usr/bin/env tsx
/**
 * TASK-022: Type Safety Audit Script
 *
 * This script audits the codebase for type safety issues:
 * - Finds all @ts-ignore directives (forbidden)
 * - Finds all @ts-expect-error directives without proper descriptions
 * - Generates a detailed report
 * - Exits with error code if issues found (for CI/CD)
 *
 * Usage:
 *   npm run audit:type-safety
 *   tsx scripts/audit-type-safety.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TypeSafetyIssue {
  file: string;
  line: number;
  type: 'ts-ignore' | 'ts-expect-error' | 'ts-nocheck';
  hasDescription: boolean;
  description?: string;
  content: string;
}

const MIN_DESCRIPTION_LENGTH = 10;
const SEARCH_PATHS = ['apps', 'packages'];
const FILE_EXTENSIONS = ['.ts', '.tsx'];

/**
 * Find all TypeScript files in the codebase
 */
function findTypeScriptFiles(): string[] {
  const files: string[] = [];

  for (const searchPath of SEARCH_PATHS) {
    if (!fs.existsSync(searchPath)) {
      continue;
    }

    try {
      const findCommand =
        process.platform === 'win32'
          ? `cd ${searchPath} && dir /s /b *.ts *.tsx 2>nul`
          : `find ${searchPath} -type f \\( -name "*.ts" -o -name "*.tsx" \\)`;

      const output = execSync(findCommand, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }).trim();

      if (output) {
        const pathFiles = output
          .split('\n')
          .map((f) => f.trim())
          .filter((f) => {
            // Skip node_modules and dist folders
            return (
              f &&
              !f.includes('node_modules') &&
              !f.includes('dist') &&
              !f.includes('coverage') &&
              !f.includes('.next')
            );
          });

        files.push(...pathFiles);
      }
    } catch (error) {
      // Continue if path doesn't exist or command fails
      console.warn(`Warning: Could not search path ${searchPath}`);
    }
  }

  return files;
}

/**
 * Scan a file for type safety issues
 */
function scanFile(filePath: string): TypeSafetyIssue[] {
  const issues: TypeSafetyIssue[] = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check for @ts-ignore
      if (trimmedLine.includes('@ts-ignore')) {
        const description = extractDescription(trimmedLine, '@ts-ignore');
        issues.push({
          file: filePath,
          line: i + 1,
          type: 'ts-ignore',
          hasDescription: description.length >= MIN_DESCRIPTION_LENGTH,
          description: description || undefined,
          content: trimmedLine,
        });
      }

      // Check for @ts-expect-error
      if (trimmedLine.includes('@ts-expect-error')) {
        const description = extractDescription(trimmedLine, '@ts-expect-error');
        issues.push({
          file: filePath,
          line: i + 1,
          type: 'ts-expect-error',
          hasDescription: description.length >= MIN_DESCRIPTION_LENGTH,
          description: description || undefined,
          content: trimmedLine,
        });
      }

      // Check for @ts-nocheck
      if (trimmedLine.includes('@ts-nocheck')) {
        issues.push({
          file: filePath,
          line: i + 1,
          type: 'ts-nocheck',
          hasDescription: false,
          content: trimmedLine,
        });
      }
    }
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }

  return issues;
}

/**
 * Extract description from ts-ignore/ts-expect-error comment
 */
function extractDescription(line: string, directive: string): string {
  // Match pattern: @ts-ignore - description or @ts-expect-error - description
  const match = line.match(new RegExp(`${directive}\\s*-\\s*(.+)$`));
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}

/**
 * Generate detailed report of type safety issues
 */
function generateReport(issues: TypeSafetyIssue[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('  TYPE SAFETY AUDIT REPORT (TASK-022)');
  console.log('='.repeat(60) + '\n');

  // Summary statistics
  const tsIgnoreCount = issues.filter((i) => i.type === 'ts-ignore').length;
  const tsExpectErrorCount = issues.filter((i) => i.type === 'ts-expect-error').length;
  const tsNocheckCount = issues.filter((i) => i.type === 'ts-nocheck').length;
  const noDescCount = issues.filter((i) => !i.hasDescription).length;

  console.log('📊 Summary:');
  console.log(`   Total issues found: ${issues.length}`);
  console.log(`   - @ts-ignore: ${tsIgnoreCount} ${tsIgnoreCount > 0 ? '❌' : '✅'}`);
  console.log(`   - @ts-expect-error: ${tsExpectErrorCount}`);
  console.log(`   - @ts-nocheck: ${tsNocheckCount} ${tsNocheckCount > 0 ? '❌' : '✅'}`);
  console.log(
    `   - Without description: ${noDescCount} ${noDescCount > 0 ? '⚠️' : '✅'}\n`
  );

  if (issues.length === 0) {
    console.log('✅ No type safety issues found!\n');
    console.log('Your codebase maintains strict type safety. Great work! 🎉\n');
    return;
  }

  // Group issues by file
  const byFile = issues.reduce(
    (acc, issue) => {
      if (!acc[issue.file]) {
        acc[issue.file] = [];
      }
      acc[issue.file].push(issue);
      return acc;
    },
    {} as Record<string, TypeSafetyIssue[]>
  );

  console.log('📁 Issues by File:\n');

  const sortedFiles = Object.keys(byFile).sort();

  for (const file of sortedFiles) {
    const fileIssues = byFile[file];
    const relPath = path.relative(process.cwd(), file);

    console.log(`   ${relPath}:`);

    for (const issue of fileIssues) {
      const icon =
        issue.type === 'ts-ignore' || issue.type === 'ts-nocheck'
          ? '❌'
          : issue.hasDescription
            ? '✅'
            : '⚠️';

      console.log(`      Line ${issue.line}: ${icon} ${issue.type}`);

      if (issue.description) {
        console.log(`         → ${issue.description}`);
      } else {
        console.log(`         → (no description provided)`);
      }

      // Show snippet of the actual code
      console.log(`         Code: ${issue.content}`);
      console.log();
    }
  }

  // Recommendations
  console.log('💡 Recommendations:\n');

  if (tsIgnoreCount > 0) {
    console.log('   ❌ CRITICAL: Replace all @ts-ignore with @ts-expect-error');
    console.log('      @ts-ignore silently ignores errors and is forbidden.');
    console.log('      See: docs/TYPESCRIPT-EXCEPTIONS.md\n');
  }

  if (tsNocheckCount > 0) {
    console.log('   ❌ CRITICAL: Remove @ts-nocheck directives');
    console.log("      Don't disable type checking for entire files.");
    console.log('      Fix the underlying type issues instead.\n');
  }

  if (noDescCount > 0) {
    console.log('   ⚠️  Add descriptions to @ts-expect-error (min 10 chars)');
    console.log('      Explain WHY the type error is expected.');
    console.log('      Example: // @ts-expect-error - Third-party lib missing types (TASK-XXX)\n');
  }

  console.log('📖 Documentation: docs/TYPESCRIPT-EXCEPTIONS.md');
  console.log('🔧 ESLint Config: .eslintrc.js\n');
}

/**
 * Main execution
 */
function main(): void {
  console.log('🔍 Scanning codebase for type safety issues...\n');

  const startTime = Date.now();

  // Find all TypeScript files
  const files = findTypeScriptFiles();
  console.log(`   Found ${files.length} TypeScript files\n`);

  // Scan each file
  let allIssues: TypeSafetyIssue[] = [];
  for (const file of files) {
    const issues = scanFile(file);
    allIssues = allIssues.concat(issues);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`   Scan completed in ${duration}s\n`);

  // Generate report
  generateReport(allIssues);

  // Exit with appropriate code
  const hasCriticalIssues =
    allIssues.some((i) => i.type === 'ts-ignore' || i.type === 'ts-nocheck') ||
    allIssues.some((i) => i.type === 'ts-expect-error' && !i.hasDescription);

  if (hasCriticalIssues) {
    console.error('❌ Type safety audit FAILED\n');
    process.exit(1);
  }

  if (allIssues.length > 0) {
    console.warn('⚠️  Type safety audit completed with warnings\n');
    // Don't fail CI for warnings, but show them
    process.exit(0);
  }

  console.log('✅ Type safety audit PASSED\n');
  process.exit(0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { findTypeScriptFiles, scanFile, TypeSafetyIssue };
