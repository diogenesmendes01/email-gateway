const { PrismaClient } = require('@email-gateway/database');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: 'Test Company' }
  });

  console.log('Company encontrada:');
  console.log('ID:', company.id);
  console.log('Name:', company.name);
  console.log('API Key Prefix:', company.apiKeyPrefix);
  console.log('API Key Hash (primeiros 50 chars):', company.apiKeyHash.substring(0, 50));
  console.log('Is Active:', company.isActive);
  console.log('Is Approved:', company.isApproved);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
