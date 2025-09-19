#!/bin/bash

# Script de configuração de ambiente para Gikamura Reader
# Uso: ./scripts/setup-env.sh [setup|switch|status]

set -e

ENV_FILE=".env"

# Função para mostrar status atual
show_status() {
    echo "📊 Status do Ambiente"
    echo "===================="

    if [[ -f $ENV_FILE ]]; then
        local current_env=$(grep "^ENVIRONMENT=" $ENV_FILE | cut -d'=' -f2)
        echo "🔧 Ambiente atual: $current_env"
    else
        echo "❌ Arquivo .env não encontrado"
    fi

    echo ""
    echo "🔗 Remotes Git:"
    git remote -v

    echo ""
    echo "📂 Branch atual:"
    git branch --show-current
}

# Função para configurar ambiente
setup_environment() {
    echo "🔧 Configurando ambiente..."

    if [[ ! -f $ENV_FILE ]]; then
        echo "❌ Arquivo .env não encontrado. Crie-o primeiro."
        exit 1
    fi

    echo "✅ Arquivo .env encontrado"
    echo "✅ Remotes configurados:"
    git remote -v

    echo ""
    echo "🎯 Configuração completa!"
    echo "Use './scripts/deploy.sh rc' para deploy RC"
    echo "Use './scripts/deploy.sh production' para deploy Produção"
}

# Função para alternar ambiente
switch_environment() {
    local target_env=$1

    if [[ -z $target_env ]]; then
        echo "❌ Especifique o ambiente: production, rc"
        exit 1
    fi

    case $target_env in
        "production"|"prod")
            sed -i 's/^ENVIRONMENT=.*/ENVIRONMENT=production/' $ENV_FILE
            echo "🔴 Ambiente alterado para: PRODUCTION"
            ;;
        "rc")
            sed -i 's/^ENVIRONMENT=.*/ENVIRONMENT=rc/' $ENV_FILE
            echo "🟡 Ambiente alterado para: RC"
            ;;
        *)
            echo "❌ Ambiente inválido: $target_env"
            echo "Use: production, rc"
            exit 1
            ;;
    esac
}

# Comando principal
case ${1:-status} in
    "setup")
        setup_environment
        ;;
    "switch")
        switch_environment $2
        ;;
    "status")
        show_status
        ;;
    *)
        echo "Uso: $0 [setup|switch|status]"
        echo ""
        echo "Comandos:"
        echo "  setup           - Configurar ambiente inicial"
        echo "  switch [env]    - Alternar entre ambientes (production|rc)"
        echo "  status          - Mostrar status atual"
        exit 1
        ;;
esac