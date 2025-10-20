#!/usr/bin/env node

/**
 * Script para gerar hashes de senhas para Basic Auth
 * 
 * Uso:
 * node scripts/generate-basic-auth-hashes.js [senha]
 * 
 * Exemplo:
 * node scripts/generate-basic-auth-hashes.js admin123
 */

const bcrypt = require('bcrypt');

async function generateHash(password) {
  if (!password) {
    console.error('❌ Erro: Forneça uma senha como argumento');
    console.log('Uso: node scripts/generate-basic-auth-hashes.js [senha]');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    
    console.log('🔐 Hash gerado com sucesso!');
    console.log('');
    console.log('Senha:', password);
    console.log('Hash:', hash);
    console.log('');
    console.log('📝 Para usar no código:');
    console.log(`{
  username: 'admin',
  password: '${hash}', // senha: ${password}
}`);
    console.log('');
    console.log('⚠️  Importante:');
    console.log('- Mantenha a senha original em local seguro');
    console.log('- Use apenas o hash no código');
    console.log('- Considere usar variáveis de ambiente para produção');
    
  } catch (error) {
    console.error('❌ Erro ao gerar hash:', error.message);
    process.exit(1);
  }
}

// Obter senha dos argumentos da linha de comando
const password = process.argv[2];

// Executar
generateHash(password);
