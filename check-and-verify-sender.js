const { SESClient, ListVerifiedEmailAddressesCommand, VerifyEmailIdentityCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAYAHATAL2KGMXCGM6',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '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',
  },
});

async function main() {
  const recipientEmail = 'diogenes.mendes01@gmail.com';
  const senderEmail = 'contato@certshiftsoftware.com.br';

  try {
    // List verified emails
    console.log('=== Verificando Status dos Emails ===\n');
    const listCommand = new ListVerifiedEmailAddressesCommand({});
    const listResponse = await sesClient.send(listCommand);

    console.log('Emails atualmente verificados no SES:');
    if (listResponse.VerifiedEmailAddresses.length === 0) {
      console.log('  (nenhum)');
    } else {
      listResponse.VerifiedEmailAddresses.forEach(email => {
        console.log(`  ✅ ${email}`);
      });
    }

    // Check recipient
    const recipientVerified = listResponse.VerifiedEmailAddresses.includes(recipientEmail);
    console.log(`\nDestinatário (${recipientEmail}): ${recipientVerified ? '✅ VERIFICADO' : '❌ NÃO VERIFICADO'}`);

    // Check sender
    const senderVerified = listResponse.VerifiedEmailAddresses.includes(senderEmail);
    console.log(`Remetente (${senderEmail}): ${senderVerified ? '✅ VERIFICADO' : '❌ NÃO VERIFICADO'}`);

    // Send verification for sender if not verified
    if (!senderVerified) {
      console.log(`\n📧 Enviando email de verificação para o remetente ${senderEmail}...`);

      const verifyCommand = new VerifyEmailIdentityCommand({
        EmailAddress: senderEmail,
      });

      await sesClient.send(verifyCommand);
      console.log(`✅ Email de verificação enviado para ${senderEmail}`);
      console.log('Por favor, verifique a caixa de entrada e clique no link.');
    }

    // Summary
    console.log('\n=== Resumo ===');
    if (recipientVerified && senderVerified) {
      console.log('✅ Tudo pronto! Você pode enviar emails agora.');
    } else {
      console.log('⏳ Aguardando verificações:');
      if (!recipientVerified) console.log('   - Destinatário precisa clicar no link de verificação');
      if (!senderVerified) console.log('   - Remetente precisa clicar no link de verificação');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

main();
