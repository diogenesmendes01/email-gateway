/**
 * Script para criar company de teste
 * Execute: node create-test-company.js
 */

const { PrismaClient } = require('@email-gateway/database');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Criando company de teste...\n');

  // Gerar API Key única
  const apiKey = `test_${crypto.randomBytes(32).toString('hex')}`;
  const apiKeyHash = await bcrypt.hash(apiKey, 10); // Usar bcrypt ao invés de SHA256
  const apiKeyPrefix = apiKey.substring(0, 12);

  // Gerar senha hash (para campo obrigatório)
  const passwordHash = await bcrypt.hash('test-password-123', 10); // Usar bcrypt ao invés de SHA256

  // Datas da API Key (1 ano de validade)
  const apiKeyCreatedAt = new Date();
  const apiKeyExpiresAt = new Date();
  apiKeyExpiresAt.setFullYear(apiKeyExpiresAt.getFullYear() + 1);

  // Buscar company existente por nome
  let company = await prisma.company.findFirst({
    where: { name: 'Test Company' }
  });

  if (company) {
    console.log('⚠️  Company já existe, atualizando...\n');
    // Atualizar company existente
    company = await prisma.company.update({
      where: { id: company.id },
      data: {
        apiKey: apiKeyHash,
        apiKeyHash,
        apiKeyPrefix,
        apiKeyCreatedAt,
        apiKeyExpiresAt,
        passwordHash,
        isActive: true,
        isApproved: true,
        dailyEmailLimit: 1000,
        defaultFromAddress: 'teste@certshiftsoftware.com.br',
        defaultFromName: 'Test Company',
      },
    });
  } else {
    console.log('✨ Criando nova company...\n');
    // Criar nova company
    company = await prisma.company.create({
      data: {
        name: 'Test Company',
        email: 'test@testcompany.com',
        passwordHash,
        apiKey: apiKeyHash,
        apiKeyHash,
        apiKeyPrefix,
        apiKeyCreatedAt,
        apiKeyExpiresAt,
        isActive: true,
        isApproved: true,
        isSuspended: false,
        dailyEmailLimit: 1000,
        defaultFromAddress: 'teste@certshiftsoftware.com.br',
        defaultFromName: 'Test Company',
      },
    });
  }

  console.log('✅ Company criada com sucesso!\n');
  console.log('📋 Informações:');
  console.log('─'.repeat(60));
  console.log(`Company ID:      ${company.id}`);
  console.log(`Company Name:    ${company.name}`);
  console.log(`Email:           ${company.email}`);
  console.log(`From Address:    ${company.defaultFromAddress}`);
  console.log(`From Name:       ${company.defaultFromName}`);
  console.log(`Daily Limit:     ${company.dailyEmailLimit} emails`);
  console.log(`Status:          ${company.isActive ? 'Ativo' : 'Inativo'}`);
  console.log(`Approved:        ${company.isApproved ? 'Sim' : 'Não'}`);
  console.log('─'.repeat(60));
  console.log('\n🔑 API KEY (GUARDE ESTA CHAVE):');
  console.log('─'.repeat(60));
  console.log(apiKey);
  console.log('─'.repeat(60));
  console.log('\n💡 Use esta API Key nos headers das requisições:');
  console.log('   Header: x-api-key');
  console.log(`   Value:  ${apiKey}`);
  console.log('\n📝 Exemplo de teste com cURL:');
  console.log('─'.repeat(60));
  console.log(`curl -X POST http://localhost:3300/v1/email/send \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "seu-email@gmail.com",
    "subject": "Teste Email Gateway",
    "html": "<h1>Funcionou!</h1><p>Email enviado com sucesso</p>"
  }'`);
  console.log('─'.repeat(60));
  console.log('\n✅ Pronto para testar!\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao criar company:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
