#!/bin/bash

# Deploy script para Gikamura Reader
# Uso: ./scripts/deploy.sh [production|rc]

set -e

ENVIRONMENT=${1:-rc}

echo "🚀 Deploy para ambiente: $ENVIRONMENT"

# Verificar se há mudanças não commitadas
if [[ -n $(git status --porcelain) ]]; then
    echo "❌ Há mudanças não commitadas. Commit suas alterações primeiro."
    exit 1
fi

# Função para deploy
deploy_to_env() {
    local env=$1
    local remote=$2
    local branch=${3:-main}

    echo "📦 Fazendo push para $env..."

    if ! git push $remote $branch; then
        echo "❌ Falha no push para $env"
        exit 1
    fi

    echo "✅ Deploy para $env concluído com sucesso!"

    # Mostrar status dos workflows
    echo "📊 Verificando status dos workflows..."
    gh run list --repo $2 --limit 3 || echo "⚠️  Não foi possível verificar workflows (gh CLI pode não estar configurado)"
}

case $ENVIRONMENT in
    "production"|"prod")
        echo "🔴 PRODUÇÃO - Fazendo deploy para gikamura/reader"
        deploy_to_env "PRODUCTION" "origin"
        echo "🌐 URL: https://gikamura.github.io/reader/"
        ;;
    "rc")
        echo "🟡 RC - Fazendo deploy para gikamura/rc"
        deploy_to_env "RC" "rc"
        echo "🌐 URL: https://gikamura.github.io/rc/"
        ;;
    *)
        echo "❌ Ambiente inválido. Use: production, prod, ou rc"
        echo "Uso: $0 [production|rc]"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deploy concluído!"
echo "⏰ Aguarde 2-3 minutos para o GitHub Pages atualizar."