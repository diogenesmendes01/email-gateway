const { prisma } = require('@email-gateway/database');

async function main() {
  const email = await prisma.emailOutbox.findUnique({
    where: { id: 'cmhclwvl70000ccwy2ww1b5rs' },
    select: {
      id: true,
      status: true,
      lastError: true,
      attempts: true,
      processedAt: true,
      createdAt: true,
      enqueuedAt: true
    }
  });

  console.log('=== Email Status ===');
  console.log(JSON.stringify(email, null, 2));

  const log = await prisma.emailLog.findFirst({
    where: { outboxId: 'cmhclwvl70000ccwy2ww1b5rs' }
  });

  console.log('\n=== Email Log ===');
  console.log(JSON.stringify(log, null, 2));
}

main().finally(() => prisma.$disconnect());
