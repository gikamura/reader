# Guia de Deploy para Produção

## Arquivos Necessários na Produção

### ✅ Arquivos Essenciais (DEVEM estar no repositório de produção)

#### Core da Aplicação
- `index.html` - Página principal
- `manifest.json` - Manifesto da PWA
- `sw.js` - Service Worker (offline + sync)

#### JavaScript Modules
- `app.js` - Ponto de entrada principal
- `store.js` - Gerenciamento de estado
- `ui.js` - Renderização da UI
- `api.js` - Comunicação com APIs
- `cache.js` - Sistema de cache
- `constants.js` - Configurações
- `shared-utils.js` - Utilitários compartilhados
- `cache-coordinator.js` - Coordenador de cache
- `error-handler.js` - Tratamento de erros
- `input-validator.js` - Validação de entrada
- `local-analytics.js` - Analytics locais
- `smart-debounce.js` - Debounce e autocomplete
- `touch-gestures.js` - Gestos touch
- `update-worker.js` - Web Worker

#### Assets
- `icons/` - Pasta com ícones da PWA
  - `icon-192.png`
  - `badge-72.png`

### ❌ Arquivos que NÃO devem ir para produção

#### Desenvolvimento e Configuração
- `.env` - Variáveis de ambiente locais
- `.env.example` - Exemplo de configuração
- `.claude/` - Configurações do Claude
- `.github/` - Workflows CI/CD (se não quiser)
- `CLAUDE.md` - Instruções do Claude
- `GEMINI.md` - Instruções do Gemini
- `readme.md` - README de desenvolvimento

#### Pastas de Desenvolvimento
- `test/` - Testes automatizados
- `scripts/` - Scripts de build/deploy
- `log/` - Logs de desenvolvimento
- `docs/` - Documentação técnica

#### Sistema
- `.git/` - Controle de versão (novo repo terá próprio)
- `.gitignore` - Ignorar desenvolvimento
- `.DS_Store`, `Thumbs.db` - Sistema operacional

## Processo de Deploy para Produção

### Opção 1: Deploy Manual Limpo

```bash
# 1. Criar novo repositório de produção vazio
# GitHub: gikamura/reader

# 2. Clonar este repositório em novo diretório
cd ~/temp
git clone /home/jhoorodr/Projetos/Projetos-code/reader reader-clean

# 3. Entrar no diretório e remover histórico git
cd reader-clean
rm -rf .git

# 4. Remover arquivos de desenvolvimento
rm -rf test/ scripts/ log/ docs/ .claude/
rm .env .env.example CLAUDE.md GEMINI.md readme.md
rm .gitignore PRODUCTION_DEPLOY.md

# 5. Copiar .gitignore de produção
mv .gitignore.production .gitignore

# 6. Inicializar novo repositório
git init
git add .
git commit -m "chore: Deploy inicial para produção

PWA completa com todas as funcionalidades:
- Sistema de scans com busca e autocomplete
- Favoritos integrados
- Cache inteligente com versionamento
- Offline-first com Service Worker
- Analytics locais
- Touch gestures
- Sistema de notificações

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 7. Adicionar remote de produção
git remote add origin https://github.com/gikamura/reader.git

# 8. Push para produção
git branch -M main
git push -u origin main
```

### Opção 2: Deploy via Script Automatizado

```bash
# Usar o script de deploy existente
./scripts/deploy.sh production
```

## Configuração GitHub Pages (Produção)

1. Acesse: https://github.com/gikamura/reader/settings/pages
2. **Source**: Deploy from a branch
3. **Branch**: main / (root)
4. Aguarde 2-3 minutos para deploy
5. URL final: https://gikamura.github.io/reader/

## Estrutura Final no GitHub (Produção)

```
gikamura/reader/
├── icons/
│   ├── icon-192.png
│   └── badge-72.png
├── .gitignore
├── api.js
├── app.js
├── cache-coordinator.js
├── cache.js
├── constants.js
├── error-handler.js
├── index.html
├── input-validator.js
├── local-analytics.js
├── manifest.json
├── shared-utils.js
├── smart-debounce.js
├── store.js
├── sw.js
├── touch-gestures.js
├── ui.js
└── update-worker.js
```

## Verificação Pós-Deploy

Após deploy, verificar:

- [ ] PWA instala corretamente
- [ ] Service Worker registra
- [ ] Funciona offline
- [ ] Scans carregam
- [ ] Busca funciona
- [ ] Autocomplete funciona
- [ ] Favoritos salvam
- [ ] Cache funciona
- [ ] Notificações funcionam (se habilitadas)

## Manutenção

Para atualizações futuras na produção:

1. Desenvolver e testar no RC
2. Quando aprovado, fazer commit
3. Deploy para produção via script ou manual
4. Verificar funcionamento

## Notas Importantes

⚠️ **NUNCA** commitar `.env` em produção
⚠️ **SEMPRE** testar no RC antes de produção
✅ Produção deve ter apenas código essencial
✅ Manter histórico git limpo em produção
