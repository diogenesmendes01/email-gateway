#!/usr/bin/env bash
set -euo pipefail

# TASK 8.2 - Configuração de IP Allowlist para Nginx
# Permite configurar IPs permitidos para acesso ao sistema

NGINX_CONF="nginx.conf"
ALLOWLIST_FILE="nginx-allowlist.conf"

# IPs padrão permitidos (configurar conforme necessário)
DEFAULT_IPS=(
    "127.0.0.1"
    "::1"
    # "192.168.1.0/24"  # Exemplo de rede local
    # "10.0.0.0/8"      # Exemplo de rede privada
)

echo "[ALLOWLIST] Configurando IP allowlist para Nginx..."

# Criar arquivo de allowlist
cat > "$ALLOWLIST_FILE" << EOF
# IP Allowlist Configuration
# TASK 8.2 - Hardening e runbooks de operação

# Mapeamento de IPs permitidos
map \$remote_addr \$allowed_ip {
    default 0;
EOF

# Adicionar IPs padrão
for ip in "${DEFAULT_IPS[@]}"; do
    echo "    $ip 1;" >> "$ALLOWLIST_FILE"
done

# Adicionar IPs personalizados se fornecidos como argumentos
for ip in "$@"; do
    # Validar formato de IP
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(/[0-9]{1,2})?$ ]] || [[ $ip =~ ^[a-fA-F0-9:]+(/[0-9]{1,3})?$ ]]; then
        echo "    $ip 1;" >> "$ALLOWLIST_FILE"
        echo "[ALLOWLIST] IP adicionado: $ip"
    else
        echo "[ALLOWLIST] AVISO: IP inválido ignorado: $ip"
    fi
done

cat >> "$ALLOWLIST_FILE" << EOF
}

# Bloquear IPs não permitidos
map \$allowed_ip \$blocked_ip {
    default 1;
    1 0;
}
EOF

echo "[ALLOWLIST] Arquivo de allowlist criado: $ALLOWLIST_FILE"
echo ""
echo "Para aplicar o allowlist:"
echo "1. Inclua o arquivo no nginx.conf:"
echo "   include $ALLOWLIST_FILE;"
echo ""
echo "2. Adicione a verificação nos locations:"
echo "   if (\$blocked_ip) {"
echo "       return 403;"
echo "   }"
echo ""
echo "3. Reinicie o Nginx:"
echo "   docker-compose restart nginx"
echo ""
echo "IPs configurados:"
cat "$ALLOWLIST_FILE" | grep -E "^\s+[0-9]" | sed 's/^/  /'
