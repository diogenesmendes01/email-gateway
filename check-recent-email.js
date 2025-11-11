const { prisma } = require('@email-gateway/database');

async function main() {
  const emailId = 'cmhdhaw880005ccwydp0ie5om';

  const email = await prisma.emailOutbox.findUnique({
    where: { id: emailId },
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

  console.log('=== Status do Email ===');
  console.log(JSON.stringify(email, null, 2));

  const log = await prisma.emailLog.findFirst({
    where: { outboxId: emailId },
    select: {
      status: true,
      sesMessageId: true,
      errorCode: true,
      errorReason: true,
      durationMs: true,
      sentAt: true,
      failedAt: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log('\n=== Log do Email ===');
  console.log(JSON.stringify(log, null, 2));

  if (email?.status === 'SENT' && log?.sesMessageId) {
    console.log('\n✅ EMAIL ENVIADO COM SUCESSO!');
    console.log(`SES Message ID: ${log.sesMessageId}`);
    console.log(`Duração: ${log.durationMs}ms`);
    console.log('\n🎉 Verifique sua caixa de entrada em diogenes.mendes01@gmail.com');
  } else if (email?.status === 'FAILED') {
    console.log('\n❌ EMAIL FALHOU');
    console.log(`Erro: ${log?.errorCode} - ${log?.errorReason}`);
  } else {
    console.log('\n⏳ Email ainda está sendo processado...');
    console.log(`Status atual: ${email?.status}`);
  }
}

main().finally(() => prisma.$disconnect());
