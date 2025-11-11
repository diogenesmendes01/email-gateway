const bcrypt = require('bcrypt');
const { PrismaClient } = require('@email-gateway/database');
const prisma = new PrismaClient();

async function main() {
  const testApiKey = 'test_ede01395521361673492a7dc538eea455bd343a3d70f9f0f61a9436a474d112b';

  // Buscar company
  const company = await prisma.company.findFirst({
    where: { name: 'Test Company' }
  });

  console.log('Testando validação da API Key...\n');
  console.log('API Key:', testApiKey);
  console.log('Hash no banco:', company.apiKeyHash);
  console.log('Prefix no banco:', company.apiKeyPrefix);

  // Testar bcrypt compare
  const isValid = await bcrypt.compare(testApiKey, company.apiKeyHash);
  console.log('\nResultado do bcrypt.compare:', isValid);

  // Testar extração de prefix como o código faz
  const prefix = testApiKey.split('_')[0] + '_' + testApiKey.split('_')[1];
  console.log('\nPrefix extraído pelo código:', prefix);
  console.log('Prefix no banco:', company.apiKeyPrefix);
  console.log('Match:', prefix === company.apiKeyPrefix);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
