const { SESClient, ListVerifiedEmailAddressesCommand, VerifyEmailIdentityCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'AKIAYAHATAL2KGMXCGM6',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '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',
  },
});

async function main() {
  const targetEmail = 'diogenes.mendes01@gmail.com';

  try {
    // List verified emails
    console.log('=== Emails Verificados no SES ===');
    const listCommand = new ListVerifiedEmailAddressesCommand({});
    const listResponse = await sesClient.send(listCommand);

    console.log('Emails verificados:');
    listResponse.VerifiedEmailAddresses.forEach(email => {
      console.log(`  - ${email}`);
    });

    // Check if target email is verified
    const isVerified = listResponse.VerifiedEmailAddresses.includes(targetEmail);

    if (isVerified) {
      console.log(`\n✅ O email ${targetEmail} JÁ está verificado!`);
    } else {
      console.log(`\n❌ O email ${targetEmail} NÃO está verificado.`);
      console.log(`\nEnviando email de verificação para ${targetEmail}...`);

      const verifyCommand = new VerifyEmailIdentityCommand({
        EmailAddress: targetEmail,
      });

      await sesClient.send(verifyCommand);

      console.log(`✅ Email de verificação enviado para ${targetEmail}`);
      console.log('Por favor, verifique a caixa de entrada e clique no link de verificação.');
      console.log('Após verificar, você poderá enviar emails para este endereço em sandbox mode.');
    }

  } catch (error) {
    console.error('Erro ao verificar emails:', error.message);
    if (error.name === 'InvalidClientTokenId') {
      console.error('\n❌ Credenciais AWS inválidas. Verifique AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY.');
    }
  }
}

main();
