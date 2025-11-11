const { prisma } = require('@email-gateway/database');

async function main() {
  // Check specific email
  console.log('=== Email ld9owqas3x259aazhnbb78p7 ===');
  const email = await prisma.emailOutbox.findUnique({
    where: { id: 'ld9owqas3x259aazhnbb78p7' }
  });
  console.log(JSON.stringify(email, null, 2));

  // Check last 5 emails
  console.log('\n=== Last 5 Emails ===');
  const emails = await prisma.emailOutbox.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      lastError: true,
      createdAt: true,
      enqueuedAt: true,
      processedAt: true,
      attempts: true
    }
  });
  console.log(JSON.stringify(emails, null, 2));

  // Check email logs
  console.log('\n=== Email Logs for ld9owqas3x259aazhnbb78p7 ===');
  const logs = await prisma.emailLog.findMany({
    where: { outboxId: 'ld9owqas3x259aazhnbb78p7' },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(logs, null, 2));
}

main()
  .finally(() => prisma.$disconnect());
