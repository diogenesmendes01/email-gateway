import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Criar empresa de teste APROVADA (pode enviar emails)
  const approvedCompany = await prisma.company.upsert({
    where: { apiKey: 'sk_test_approved_12345' },
    update: {},
    create: {
      name: 'Test Company (Approved)',
      apiKey: 'sk_test_approved_12345',
      apiKeyHash: await bcrypt.hash('sk_test_approved_12345', 10),
      apiKeyPrefix: 'sk_test',
      apiKeyCreatedAt: new Date(),
      apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 dias
      isActive: true,

      // TASK-026: Campos multi-tenant
      dailyEmailLimit: 5000,
      isApproved: true,
      approvedAt: new Date(),
      approvedBy: 'SEED_SCRIPT',
      bounceRate: 0.5,
      complaintRate: 0.01,
    },
  });

  console.log('✅ Created approved company:', approvedCompany.id);

  // 2. Criar empresa de teste NÃO APROVADA (sandbox)
  const sandboxCompany = await prisma.company.upsert({
    where: { apiKey: 'sk_sandbox_test_12345' },
    update: {},
    create: {
      name: 'Test Company (Sandbox)',
      apiKey: 'sk_sandbox_test_12345',
      apiKeyHash: await bcrypt.hash('sk_sandbox_test_12345', 10),
      apiKeyPrefix: 'sk_sand',
      apiKeyCreatedAt: new Date(),
      apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      isActive: true,

      // TASK-026: Sandbox mode (não aprovado)
      dailyEmailLimit: 100, // Limite baixo
      isApproved: false,
      bounceRate: 0,
      complaintRate: 0,
    },
  });

  console.log('✅ Created sandbox company:', sandboxCompany.id);

  // 3. Criar empresa SUSPENSA (má reputação)
  const suspendedCompany = await prisma.company.upsert({
    where: { apiKey: 'sk_suspended_test_12345' },
    update: {},
    create: {
      name: 'Test Company (Suspended)',
      apiKey: 'sk_suspended_test_12345',
      apiKeyHash: await bcrypt.hash('sk_suspended_test_12345', 10),
      apiKeyPrefix: 'sk_susp',
      apiKeyCreatedAt: new Date(),
      apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      isActive: true,

      // TASK-026: Suspended (bounce rate alto)
      dailyEmailLimit: 1000,
      isApproved: true,
      isSuspended: true,
      suspensionReason: 'High bounce rate (6.5%) - Automatic suspension',
      bounceRate: 6.5,
      complaintRate: 0.02,
      lastMetricsUpdate: new Date(),
    },
  });

  console.log('✅ Created suspended company:', suspendedCompany.id);

  // 4. Criar domínio verificado para empresa aprovada
  const domain = await prisma.domain.upsert({
    where: {
      companyId_domain: {
        companyId: approvedCompany.id,
        domain: 'testcompany.com',
      },
    },
    update: {},
    create: {
      companyId: approvedCompany.id,
      domain: 'testcompany.com',
      status: 'VERIFIED',
      dkimStatus: 'VERIFIED',
      dkimTokens: ['token1', 'token2', 'token3'],
      isProductionReady: true,
    },
  });

  console.log('✅ Created verified domain:', domain.id);

  // 5. Definir como domínio padrão
  await prisma.company.update({
    where: { id: approvedCompany.id },
    data: {
      domainId: domain.id,
      defaultFromAddress: 'vendas@testcompany.com',
      defaultFromName: 'Equipe Vendas',
    },
  });

  console.log('✅ Set default domain for approved company');

  console.log('\n🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
