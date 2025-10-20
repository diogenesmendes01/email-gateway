#!/usr/bin/env node

/**
 * Domain Management CLI Tool
 * 
 * TASK 6.2 - SES Domain and DNS Management
 * 
 * Usage:
 *   node manage-domains.js list [companyId]
 *   node manage-domains.js add <domain> [companyId]
 *   node manage-domains.js verify <domain> [companyId]
 *   node manage-domains.js status <domain> [companyId]
 *   node manage-domains.js dkim <domain> [companyId]
 *   node manage-domains.js validate-dns <domain> [companyId]
 *   node manage-domains.js quota
 *   node manage-domains.js checklist <domain> [companyId]
 *   node manage-domains.js region
 */

const { PrismaClient } = require('@prisma/client');
const { DomainManagementService } = require('@email-gateway/shared');

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    showHelp();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'list':
        await listDomains(args[1]);
        break;
      case 'add':
        await addDomain(args[1], args[2]);
        break;
      case 'verify':
        await verifyDomain(args[1], args[2]);
        break;
      case 'status':
        await getDomainStatus(args[1], args[2]);
        break;
      case 'dkim':
        await enableDKIM(args[1], args[2]);
        break;
      case 'validate-dns':
        await validateDNS(args[1], args[2]);
        break;
      case 'quota':
        await getSESQuota();
        break;
      case 'checklist':
        await getSandboxChecklist(args[1], args[2]);
        break;
      case 'region':
        await validateRegion();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function listDomains(companyId) {
  if (!companyId) {
    console.error('Company ID is required');
    process.exit(1);
  }

  const domains = await prisma.domain.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n📋 Domains for company ${companyId}:`);
  console.log('─'.repeat(80));
  
  if (domains.length === 0) {
    console.log('No domains found.');
    return;
  }

  domains.forEach(domain => {
    console.log(`🌐 ${domain.domain}`);
    console.log(`   Status: ${domain.status}`);
    console.log(`   DKIM: ${domain.dkimStatus}`);
    console.log(`   Created: ${domain.createdAt.toISOString()}`);
    console.log(`   Last Checked: ${domain.lastChecked?.toISOString() || 'Never'}`);
    if (domain.errorMessage) {
      console.log(`   Error: ${domain.errorMessage}`);
    }
    console.log('');
  });
}

async function addDomain(domain, companyId) {
  if (!domain || !companyId) {
    console.error('Domain and Company ID are required');
    process.exit(1);
  }

  // Verificar se domínio já existe
  const existing = await prisma.domain.findUnique({
    where: {
      companyId_domain: {
        companyId,
        domain,
      },
    },
  });

  if (existing) {
    console.error(`Domain ${domain} already exists for company ${companyId}`);
    process.exit(1);
  }

  const newDomain = await prisma.domain.create({
    data: {
      companyId,
      domain,
      status: 'PENDING',
      dkimStatus: 'PENDING',
    },
  });

  console.log(`✅ Domain ${domain} added successfully`);
  console.log(`   ID: ${newDomain.id}`);
  console.log(`   Status: ${newDomain.status}`);
}

async function verifyDomain(domain, companyId) {
  if (!domain || !companyId) {
    console.error('Domain and Company ID are required');
    process.exit(1);
  }

  const domainRecord = await findDomain(companyId, domain);
  const domainService = new DomainManagementService();

  console.log(`🔄 Starting verification for ${domain}...`);
  
  const result = await domainService.verifyDomain(domain);
  
  await prisma.domain.update({
    where: { id: domainRecord.id },
    data: {
      status: result.status,
      lastChecked: new Date(),
      errorMessage: result.errorMessage,
    },
  });

  console.log(`✅ Verification initiated for ${domain}`);
  if (result.verificationToken) {
    console.log(`   Verification Token: ${result.verificationToken}`);
  }
  if (result.errorMessage) {
    console.log(`   Error: ${result.errorMessage}`);
  }
}

async function getDomainStatus(domain, companyId) {
  if (!domain || !companyId) {
    console.error('Domain and Company ID are required');
    process.exit(1);
  }

  const domainRecord = await findDomain(companyId, domain);
  const domainService = new DomainManagementService();

  console.log(`📊 Status for ${domain}:`);
  console.log('─'.repeat(50));
  
  const status = await domainService.getDomainVerificationStatus(domain);
  
  console.log(`Status: ${status.status}`);
  console.log(`Last Checked: ${domainRecord.lastChecked?.toISOString() || 'Never'}`);
  console.log(`Last Verified: ${domainRecord.lastVerified?.toISOString() || 'Never'}`);
  
  if (status.errorMessage) {
    console.log(`Error: ${status.errorMessage}`);
  }
}

async function enableDKIM(domain, companyId) {
  if (!domain || !companyId) {
    console.error('Domain and Company ID are required');
    process.exit(1);
  }

  const domainRecord = await findDomain(companyId, domain);
  const domainService = new DomainManagementService();

  console.log(`🔐 Enabling DKIM for ${domain}...`);
  
  const result = await domainService.enableDKIM(domain);
  
  await prisma.domain.update({
    where: { id: domainRecord.id },
    data: {
      dkimStatus: result.status,
      dkimTokens: result.tokens,
      dkimRecords: result.records,
      errorMessage: result.errorMessage,
    },
  });

  console.log(`✅ DKIM enabled for ${domain}`);
  console.log(`   Tokens: ${result.tokens.join(', ')}`);
  
  if (result.records.length > 0) {
    console.log('   DNS Records to add:');
    result.records.forEach(record => {
      console.log(`     ${record.name} TXT "${record.value}"`);
    });
  }
}

async function validateDNS(domain, companyId) {
  if (!domain || !companyId) {
    console.error('Domain and Company ID are required');
    process.exit(1);
  }

  const domainRecord = await findDomain(companyId, domain);
  const domainService = new DomainManagementService();

  console.log(`🔍 Validating DNS records for ${domain}...`);
  
  const expectedRecords = {
    spf: domainRecord.spfRecord,
    dkim: domainRecord.dkimRecords,
    dmarc: domainRecord.dmarcRecord,
  };

  const result = await domainService.validateDNSRecords(domain, expectedRecords);
  
  console.log(`📊 DNS Validation Results for ${domain}:`);
  console.log('─'.repeat(50));
  console.log(`SPF Valid: ${result.spfValid ? '✅' : '❌'}`);
  console.log(`DKIM Valid: ${result.dkimValid ? '✅' : '❌'}`);
  console.log(`DMARC Valid: ${result.dmarcValid ? '✅' : '❌'}`);
  
  if (result.missingRecords.length > 0) {
    console.log('\n❌ Missing Records:');
    result.missingRecords.forEach(record => {
      console.log(`   - ${record}`);
    });
  }
  
  if (result.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    result.errors.forEach(error => {
      console.log(`   - ${error}`);
    });
  }
}

async function getSESQuota() {
  const domainService = new DomainManagementService();
  
  console.log('📊 SES Quota Status:');
  console.log('─'.repeat(50));
  
  const quota = await domainService.getSESQuota();
  
  console.log(`Max 24h Send: ${quota.max24HourSend.toLocaleString()}`);
  console.log(`Max Send Rate: ${quota.maxSendRate}/sec`);
  console.log(`Sent Last 24h: ${quota.sentLast24Hours.toLocaleString()}`);
  console.log(`Remaining: ${quota.remainingQuota.toLocaleString()}`);
  console.log(`Usage: ${quota.quotaPercentage.toFixed(2)}%`);
  
  if (quota.quotaPercentage > 80) {
    console.log('⚠️  Warning: Quota usage is high!');
  }
}

async function getSandboxChecklist(domain, companyId) {
  if (!domain || !companyId) {
    console.error('Domain and Company ID are required');
    process.exit(1);
  }

  await findDomain(companyId, domain);
  const domainService = new DomainManagementService();

  console.log(`📋 Sandbox → Production Checklist for ${domain}:`);
  console.log('─'.repeat(60));
  
  const checklist = await domainService.getSandboxToProductionChecklist(domain);
  
  checklist.checklist.forEach((item, index) => {
    const status = item.status === 'COMPLETED' ? '✅' : 
                   item.status === 'FAILED' ? '❌' : '⏳';
    console.log(`${index + 1}. ${status} ${item.item}`);
    console.log(`   ${item.description}`);
    console.log('');
  });
}

async function validateRegion() {
  const domainService = new DomainManagementService();
  
  console.log('🌍 SES Region Validation:');
  console.log('─'.repeat(40));
  
  const result = await domainService.validateSESRegion();
  
  console.log(`Region: ${result.region}`);
  console.log(`Recommended: ${result.isRecommended ? '✅' : '❌'}`);
  
  if (result.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    result.recommendations.forEach(rec => {
      console.log(`   - ${rec}`);
    });
  }
}

async function findDomain(companyId, domain) {
  const domainRecord = await prisma.domain.findUnique({
    where: {
      companyId_domain: {
        companyId,
        domain,
      },
    },
  });

  if (!domainRecord) {
    console.error(`Domain ${domain} not found for company ${companyId}`);
    process.exit(1);
  }

  return domainRecord;
}

function showHelp() {
  console.log(`
Domain Management CLI Tool

Usage:
  node manage-domains.js <command> [arguments]

Commands:
  list <companyId>                    List domains for a company
  add <domain> <companyId>            Add a new domain
  verify <domain> <companyId>         Start domain verification
  status <domain> <companyId>         Get domain verification status
  dkim <domain> <companyId>           Enable DKIM for domain
  validate-dns <domain> <companyId>   Validate DNS records
  quota                               Get SES quota status
  checklist <domain> <companyId>      Get sandbox→production checklist
  region                              Validate SES region

Examples:
  node manage-domains.js list company_123
  node manage-domains.js add example.com company_123
  node manage-domains.js verify example.com company_123
  node manage-domains.js quota
`);
}

main().catch(console.error);
