#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Geração de certificados SSL para desenvolvimento
# Gera certificados auto-assinados para uso em desenvolvimento

SSL_DIR="./ssl"
DOMAIN=${1:-"localhost"}

echo "[SSL] Gerando certificados SSL para domínio: $DOMAIN"

# Criar diretório SSL se não existir
mkdir -p "$SSL_DIR"

# Gerar chave privada
echo "[SSL] Gerando chave privada..."
openssl genrsa -out "$SSL_DIR/key.pem" 2048

# Gerar certificado auto-assinado
echo "[SSL] Gerando certificado auto-assinado..."
openssl req -new -x509 -key "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" -days 365 -subj "/C=BR/ST=SP/L=SaoPaulo/O=EmailGateway/OU=Dev/CN=$DOMAIN"

# Definir permissões corretas
chmod 600 "$SSL_DIR/key.pem"
chmod 644 "$SSL_DIR/cert.pem"

echo "[SSL] Certificados gerados com sucesso!"
echo "[SSL] Certificado: $SSL_DIR/cert.pem"
echo "[SSL] Chave privada: $SSL_DIR/key.pem"
echo ""
echo "Para usar em produção, substitua por certificados válidos de uma CA confiável."
echo "Recomendado: Let's Encrypt ou certificados corporativos."
