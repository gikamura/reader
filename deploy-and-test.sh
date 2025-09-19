#!/bin/bash

# Script para deploy automático e testes no ambiente RC
# Uso: ./deploy-and-test.sh [rc|production]

set -e  # Sair em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log colorido
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Verificar ambiente
ENVIRONMENT=${1:-rc}

if [[ "$ENVIRONMENT" != "rc" && "$ENVIRONMENT" != "production" ]]; then
    error "Ambiente deve ser 'rc' ou 'production'"
    exit 1
fi

log "🚀 Iniciando processo de deploy para $ENVIRONMENT"

# 1. Executar testes locais
log "📋 Executando testes de qualidade..."
if command -v node &> /dev/null; then
    node test-workflow.js
    if [ $? -ne 0 ]; then
        error "Testes falharam. Abortando deploy."
        exit 1
    fi
    success "Testes locais passaram"
else
    warning "Node.js não encontrado, pulando testes automatizados"
fi

# 2. Verificar se há mudanças para commit
if [[ -n $(git status --porcelain) ]]; then
    log "📝 Detectadas mudanças não commitadas"

    echo "Mudanças encontradas:"
    git status --short

    echo ""
    read -p "Deseja commitar essas mudanças? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "💾 Criando commit..."
        git add -A
        git commit -m "feat: Implementar workflow completo de bugs e melhorias

- ✅ Corrigir sistema de autocomplete e busca
- 🛡️ Adicionar tratamento robusto de erros
- 📱 Otimizar performance mobile e acessibilidade
- 🐛 Implementar sistema de debug e monitoramento
- 🎨 Melhorar UX com loading states e feedback visual
- 🧪 Adicionar testes automatizados e QA

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
        success "Commit criado"
    else
        log "Continuando sem commit..."
    fi
fi

# 3. Deploy para ambiente especificado
log "🚢 Executando deploy para $ENVIRONMENT..."

if [[ "$ENVIRONMENT" == "rc" ]]; then
    ./scripts/deploy.sh rc
    RC_URL="https://gikamura.github.io/rc/"
    success "Deploy para RC concluído: $RC_URL"

    # 4. Testes pós-deploy no RC
    log "🔍 Aguardando deploy estar ativo (30s)..."
    sleep 30

    log "🌐 Testando disponibilidade do RC..."
    if curl -s --head "$RC_URL" | head -n 1 | grep -q "200 OK"; then
        success "RC está respondendo corretamente"

        # Instruções para teste manual
        echo ""
        log "📋 CHECKLIST DE TESTES MANUAIS NO RC:"
        echo ""
        echo "🔗 URL: $RC_URL"
        echo ""
        echo "✅ Funcionalidades para testar:"
        echo "   1. Carregamento inicial da aplicação"
        echo "   2. Sistema de busca (digite algo no campo)"
        echo "   3. Autocomplete (aparece sugestões?)"
        echo "   4. Navegação entre tabs (Início, Biblioteca, Favoritos, Atualizações)"
        echo "   5. Filtros de tipo e status na Biblioteca"
        echo "   6. Adicionar/remover favoritos"
        echo "   7. Sistema de notificações"
        echo "   8. Performance mobile (redimensione a janela)"
        echo "   9. Teste de acessibilidade (Tab para navegar)"
        echo "   10. Debug: abra console e digite: window.toggleGikamuraDebug()"
        echo ""
        echo "🚨 Problemas encontrados? Verifique:"
        echo "   - Console do navegador (F12)"
        echo "   - Network tab para requests falhando"
        echo "   - Application tab para Service Worker"
        echo ""

        # 5. Verificar métricas básicas
        log "📊 Para monitorar após deploy:"
        echo "   - Lighthouse score (Performance, Accessibility, PWA)"
        echo "   - Core Web Vitals"
        echo "   - Functionality em diferentes navegadores"
        echo "   - Mobile responsiveness"
        echo ""

    else
        error "RC não está respondendo. Verifique o deploy."
        exit 1
    fi

elif [[ "$ENVIRONMENT" == "production" ]]; then
    echo ""
    warning "⚠️  DEPLOY PARA PRODUÇÃO ⚠️"
    echo ""
    echo "Você está prestes a fazer deploy para PRODUÇÃO."
    echo "Certifique-se que:"
    echo "✅ Testes no RC foram bem-sucedidos"
    echo "✅ Funcionalidades foram validadas manualmente"
    echo "✅ Performance está aceitável"
    echo "✅ Não há bugs críticos"
    echo ""
    read -p "Continuar com deploy para PRODUÇÃO? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./scripts/deploy.sh production
        PROD_URL="https://gikamura.github.io/reader/"
        success "Deploy para PRODUÇÃO concluído: $PROD_URL"

        log "🎉 Deploy para produção realizado com sucesso!"
        echo ""
        echo "📊 Monitore nas próximas horas:"
        echo "   - Erros no console"
        echo "   - Performance real de usuários"
        echo "   - Analytics e métricas de uso"

    else
        log "Deploy para produção cancelado"
        exit 0
    fi
fi

# 6. Resumo final
echo ""
success "🎯 Processo de deploy concluído com sucesso!"
echo ""
log "📈 Próximos passos recomendados:"
echo "   1. Teste as funcionalidades manualmente"
echo "   2. Monitore logs e métricas"
echo "   3. Colete feedback dos usuários"
echo "   4. Documente qualquer problema encontrado"
echo ""

if [[ "$ENVIRONMENT" == "rc" ]]; then
    echo "💡 Lembre-se: após validação no RC, use './deploy-and-test.sh production' para produção"
fi

echo ""
success "✨ Deploy workflow completo executado!"