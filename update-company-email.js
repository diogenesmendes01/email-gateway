const { prisma } = require('@email-gateway/database');

async function main() {
  const companyId = 'cmhc4dqxi0000d5tez0pah9cn';
  const newFromAddress = 'contato@certshiftsoftware.com.br';
  const newFromName = 'CertShift Software';

  console.log('Atualizando configuração da empresa...\n');

  const updated = await prisma.company.update({
    where: { id: companyId },
    data: {
      defaultFromAddress: newFromAddress,
      defaultFromName: newFromName
    }
  });

  console.log('✅ Empresa atualizada com sucesso!');
  console.log(`ID: ${updated.id}`);
  console.log(`Nome: ${updated.name}`);
  console.log(`From Address: ${updated.defaultFromAddress}`);
  console.log(`From Name: ${updated.defaultFromName}`);
  console.log('\n🎉 Agora você pode enviar emails usando este email verificado!');
}

main().finally(() => prisma.$disconnect());
