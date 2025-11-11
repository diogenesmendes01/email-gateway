const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'AKIAYAHATAL2KGMXCGM6',
    secretAccessKey: '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',
  },
});

async function testDirectSend() {
  const params = {
    Source: 'contato@certshiftsoftware.com.br',
    Destination: {
      ToAddresses: ['diogenes.mendes01@gmail.com'],
    },
    Message: {
      Subject: {
        Data: 'Teste Direto AWS SES',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: '<h1>Teste</h1><p>Email de teste direto do AWS SES</p>',
          Charset: 'UTF-8',
        },
      },
    },
    // ConfigurationSetName: 'my-first-configuration-set', // Commented out - doesn't exist
  };

  try {
    console.log('Enviando email diretamente para o SES...');
    console.log('From:', params.Source);
    console.log('To:', params.Destination.ToAddresses);
    console.log('ConfigurationSet:', params.ConfigurationSetName);

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);

    console.log('\n✅ SUCESSO!');
    console.log('MessageId:', response.MessageId);

  } catch (error) {
    console.error('\n❌ ERRO AO ENVIAR:');
    console.error('Código:', error.name);
    console.error('Mensagem:', error.message);
    console.error('Status HTTP:', error.$metadata?.httpStatusCode);
    console.error('\nDetalhes completos:', JSON.stringify(error, null, 2));
  }
}

testDirectSend();
