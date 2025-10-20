#!/usr/bin/env node

/**
 * Script para gerenciar API Keys
 * 
 * Uso:
 * node scripts/manage-api-keys.js [comando] [opções]
 * 
 * Comandos:
 * - generate [company-name] [prefix] - Gerar nova API Key
 * - list - Listar todas as API Keys
 * - revoke [company-id] - Revogar API Key
 * - rotate [company-id] - Rotacionar API Key
 * 
 * Exemplos:
 * node scripts/manage-api-keys.js generate "Empresa ABC" sk_live
 * node scripts/manage-api-keys.js list
 * node scripts/manage-api-keys.js revoke company-123
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Simulação de dados (em produção, isso viria do banco de dados)
let companies = [
  {
    id: 'company-123',
    name: 'Empresa Exemplo',
    apiKey: 'sk_live_example123',
    apiKeyHash: '$2b$12$example.hash.here',
    apiKeyPrefix: 'sk_live',
    apiKeyCreatedAt: new Date(),
    apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 dias
    isActive: true,
  },
];

async function generateApiKey(companyName, prefix = 'sk_live') {
  try {
    // Gera token seguro de 32 bytes
    const token = crypto.randomBytes(32).toString('hex');
    const apiKey = `${prefix}_${token}`;
    
    // Hash da API Key para armazenamento seguro
    const hash = await bcrypt.hash(apiKey, 12);
    
    // Data de expiração: 90 dias a partir de agora
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    
    const companyId = `company-${crypto.randomBytes(8).toString('hex')}`;
    
    const company = {
      id: companyId,
      name: companyName,
      apiKey,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      apiKeyCreatedAt: new Date(),
      apiKeyExpiresAt: expiresAt,
      isActive: true,
    };
    
    // Em produção, salvaria no banco de dados
    companies.push(company);
    
    console.log('🔑 API Key gerada com sucesso!');
    console.log('');
    console.log('📋 Detalhes:');
    console.log('Company ID:', company.id);
    console.log('Nome:', company.name);
    console.log('API Key:', company.apiKey);
    console.log('Prefixo:', company.apiKeyPrefix);
    console.log('Criada em:', company.apiKeyCreatedAt.toISOString());
    console.log('Expira em:', company.apiKeyExpiresAt.toISOString());
    console.log('');
    console.log('⚠️  IMPORTANTE:');
    console.log('- Salve a API Key em local seguro');
    console.log('- Ela não será exibida novamente');
    console.log('- Configure IP allowlist se necessário');
    console.log('- Configure rate limits conforme necessário');
    
    return company;
    
  } catch (error) {
    console.error('❌ Erro ao gerar API Key:', error.message);
    process.exit(1);
  }
}

function listApiKeys() {
  console.log('📋 Lista de API Keys:');
  console.log('');
  
  if (companies.length === 0) {
    console.log('Nenhuma API Key encontrada.');
    return;
  }
  
  companies.forEach(company => {
    const isExpired = new Date() > company.apiKeyExpiresAt;
    const daysUntilExpiry = Math.ceil((company.apiKeyExpiresAt - new Date()) / (1000 * 60 * 60 * 24));
    
    console.log(`🏢 ${company.name}`);
    console.log(`   ID: ${company.id}`);
    console.log(`   API Key: ${company.apiKey}`);
    console.log(`   Status: ${company.isActive ? '✅ Ativa' : '❌ Inativa'}`);
    console.log(`   Expira em: ${company.apiKeyExpiresAt.toISOString()}`);
    console.log(`   Dias restantes: ${isExpired ? '⚠️  EXPIRADA' : daysUntilExpiry}`);
    console.log('');
  });
}

function revokeApiKey(companyId) {
  const company = companies.find(c => c.id === companyId);
  
  if (!company) {
    console.error(`❌ Empresa com ID ${companyId} não encontrada.`);
    process.exit(1);
  }
  
  company.isActive = false;
  
  console.log('🚫 API Key revogada com sucesso!');
  console.log('');
  console.log('📋 Detalhes:');
  console.log('Company ID:', company.id);
  console.log('Nome:', company.name);
  console.log('Status: Inativa');
  console.log('');
  console.log('⚠️  A API Key não funcionará mais a partir de agora.');
}

async function rotateApiKey(companyId) {
  const company = companies.find(c => c.id === companyId);
  
  if (!company) {
    console.error(`❌ Empresa com ID ${companyId} não encontrada.`);
    process.exit(1);
  }
  
  // Gera nova API Key
    const newApiKey = await generateApiKey(company.name, company.apiKeyPrefix);
  
  // Atualiza a empresa com a nova API Key
  company.apiKey = newApiKey.apiKey;
  company.apiKeyHash = newApiKey.apiKeyHash;
  company.apiKeyCreatedAt = newApiKey.apiKeyCreatedAt;
  company.apiKeyExpiresAt = newApiKey.apiKeyExpiresAt;
  
  console.log('🔄 API Key rotacionada com sucesso!');
  console.log('');
  console.log('📋 Nova API Key:');
  console.log('Company ID:', company.id);
  console.log('Nome:', company.name);
  console.log('Nova API Key:', company.apiKey);
  console.log('');
  console.log('⚠️  A API Key anterior não funcionará mais.');
}

function showHelp() {
  console.log('🔧 Gerenciador de API Keys');
  console.log('');
  console.log('Uso: node scripts/manage-api-keys.js [comando] [opções]');
  console.log('');
  console.log('Comandos disponíveis:');
  console.log('');
  console.log('  generate [nome-empresa] [prefixo]');
  console.log('    Gera uma nova API Key');
  console.log('    Exemplo: node scripts/manage-api-keys.js generate "Empresa ABC" sk_live');
  console.log('');
  console.log('  list');
  console.log('    Lista todas as API Keys');
  console.log('    Exemplo: node scripts/manage-api-keys.js list');
  console.log('');
  console.log('  revoke [company-id]');
  console.log('    Revoga uma API Key');
  console.log('    Exemplo: node scripts/manage-api-keys.js revoke company-123');
  console.log('');
  console.log('  rotate [company-id]');
  console.log('    Rotaciona uma API Key (gera nova e revoga a antiga)');
  console.log('    Exemplo: node scripts/manage-api-keys.js rotate company-123');
  console.log('');
  console.log('  help');
  console.log('    Exibe esta ajuda');
}

// Processar argumentos da linha de comando
const command = process.argv[2];

switch (command) {
  case 'generate':
    const companyName = process.argv[3];
    const prefix = process.argv[4] || 'sk_live';
    if (!companyName) {
      console.error('❌ Erro: Forneça o nome da empresa');
      console.log('Uso: node scripts/manage-api-keys.js generate "Nome da Empresa" [prefixo]');
      process.exit(1);
    }
    generateApiKey(companyName, prefix);
    break;
    
  case 'list':
    listApiKeys();
    break;
    
  case 'revoke':
    const companyIdToRevoke = process.argv[3];
    if (!companyIdToRevoke) {
      console.error('❌ Erro: Forneça o ID da empresa');
      console.log('Uso: node scripts/manage-api-keys.js revoke company-id');
      process.exit(1);
    }
    revokeApiKey(companyIdToRevoke);
    break;
    
  case 'rotate':
    const companyIdToRotate = process.argv[3];
    if (!companyIdToRotate) {
      console.error('❌ Erro: Forneça o ID da empresa');
      console.log('Uso: node scripts/manage-api-keys.js rotate company-id');
      process.exit(1);
    }
    rotateApiKey(companyIdToRotate);
    break;
    
  case 'help':
  case undefined:
    showHelp();
    break;
    
  default:
    console.error(`❌ Comando desconhecido: ${command}`);
    console.log('Use "help" para ver os comandos disponíveis.');
    process.exit(1);
}
