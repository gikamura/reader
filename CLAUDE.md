# CLAUDE.md

Este arquivo fornece orientações para o Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## Arquitetura da Aplicação

Esta é uma Progressive Web App (PWA) para leitura de mangás/manhwas/manhuas que funciona 100% no frontend. A arquitetura é modular e baseada em:

### Módulos Principais

- **app.js**: Ponto de entrada principal, gerencia inicialização e Service Workers
- **store.js**: Sistema de gerenciamento de estado com padrão observer/subscriber
- **ui.js**: Renderização da interface e manipulação do DOM
- **api.js**: Processamento de dados de mangás e comunicação com APIs externas
- **cache.js**: Sistema de cache usando localStorage/IndexedDB
- **constants.js**: Configurações e constantes da aplicação

### Módulos de Performance e UX

- **lazy-loader.js**: Sistema de carregamento tardio para otimizar performance
- **smart-debounce.js**: Debounce inteligente e autocomplete
- **smart-cache.js**: Cache inteligente com estratégias avançadas
- **touch-gestures.js**: Gerenciamento de gestos para navegação touch
- **error-handler.js**: Sistema centralizado de tratamento de erros
- **local-analytics.js**: Analytics locais sem dependências externas

### Workers

- **sw.js**: Service Worker para funcionamento offline e sincronização periódica
- **update-worker.js**: Web Worker para processamento assíncrono de dados (usa `importScripts`, não ES6 modules)

## Fluxo de Dados

1. **Inicialização**: `app.js` → `initializeStore()` → carrega cache → inicializa Workers → registra Service Worker
2. **Busca de Dados**: Worker busca do GitHub → processa em lotes → atualiza store → renderiza UI
3. **Estado**: Store usa padrão observer, todas as mudanças notificam subscribers
4. **Cache**: Sistema de versionamento inteligente para otimizar carregamentos
5. **Gestos e Interação**: Touch gestures → analytics locais → debounce inteligente → atualizações de UI

## Comandos de Desenvolvimento

### Servir Localmente
```bash
# A aplicação é estática, pode ser servida com qualquer servidor HTTP
python -m http.server 8000
# ou
npx serve .
```

### Configuração de Ambiente
```bash
# Configurar variáveis de ambiente
node scripts/setup-env.js setup

# Validar configurações
node scripts/setup-env.js validate
```

### Testes e Validação
```bash
# Executar testes de qualidade localmente
node test/test-workflow.js

# Validar sintaxe JavaScript de todos os arquivos
find . -name "*.js" -not -path "./node_modules/*" -not -path "./.git/*" | xargs -I {} node -c "require('fs').readFileSync('{}', 'utf8')"

# Validar manifest.json
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"

# CI/CD automatizado via GitHub Actions
# - Workflow de CI: testa sintaxe JS, valida PWA, segurança
# - Workflow de Deploy: build e deploy automático para GitHub Pages
```

### Build/Deploy
```bash
# Deploy para Produção
./scripts/deploy.sh production
# ou
git push origin main

# Deploy para RC (Release Candidate)
./scripts/deploy.sh rc
# ou
git push rc main

# Gerenciar ambientes
./scripts/setup-env.sh status        # Ver status atual
./scripts/setup-env.sh switch rc     # Alternar para RC
./scripts/setup-env.sh switch production # Alternar para produção
```

### Ambientes
- **Produção**: `gikamura/reader` → https://gikamura.github.io/reader/
- **RC**: `gikamura/rc` → https://gikamura.github.io/rc/

### CI/CD Pipeline
Ambos repositórios (Produção e RC) têm workflows independentes:

- **Continuous Integration**: `.github/workflows/ci.yml`
  - Testes de sintaxe JavaScript
  - Validação de arquivos PWA (manifest.json, service worker)
  - Verificação de segurança e audit
  - Suporte a Node.js 18.x e 20.x
  - Executa em push/PR para main

- **Continuous Deployment**: `.github/workflows/deploy.yml`
  - Deploy automático para GitHub Pages
  - Build de arquivos estáticos
  - Configuração automática de Pages
  - Executa em push para main

### GitHub Pages Setup
- **Produção**: Configurado automaticamente
- **RC**: Requer habilitação manual em Settings → Pages → Source: "GitHub Actions"

## Características Técnicas

### Dados Externos
- **Source**: GitHub Raw API (`INDEX_URL` em constants.js) - acesso direto sem proxies CORS
- **Formato**: Processa URLs do Cubari.moe para acessar dados JSON do GitHub
- **Arquitetura**: Fetch direto para `raw.githubusercontent.com` (sem CORS blocking)

### Sistema de Cache
- **Versionamento**: Compara versões local vs remota
- **Durabilidade**: Cache de 6 horas (configurável)
- **Armazenamento**: localStorage + IndexedDB via cache.js

### PWA Features
- **Manifest**: manifest.json configurado para instalação
- **Service Worker**: Funciona offline e faz sync em segundo plano
- **Notificações**: Sistema de notificações push nativo

### Estado da Aplicação
O store gerencia:
- Lista completa de mangás (`allManga`)
- Favoritos do usuário (`favorites`)
- Atualizações/novidades (`updates`)
- Configurações (`settings`)
- Estado da UI (página atual, filtros, busca)

## Padrões de Código

### Convenções
- Módulos ES6 com imports/exports
- Funções async/await para operações assíncronas
- DOM queries cacheadas no objeto `getDOM()`
- Event delegation para performance
- Analytics locais sem dependências externas
- Sistema de gestos touch responsivo
- Tratamento centralizado de erros

### Estrutura de Arquivos
- Arquivos estáticos na raiz
- Icons na pasta `/icons` (contém icon-192.png e badge-72.png)
- Documentação na pasta `/docs`
- Sem processo de build ou bundling

## Limitações e Considerações

- **HTTPS Obrigatório**: Service Workers requerem HTTPS em produção
- **Workers Limitados**: Web Workers não suportam ES6 modules nem localStorage
- **Cache Manual**: Limpeza manual pode ser necessária durante desenvolvimento
- **Compatibilidade**: Requer suporte moderno do navegador para PWA features
- **GitHub Raw**: Dependente da disponibilidade do raw.githubusercontent.com

## Debugging

### Sistema de Debug Global
```javascript
// Ativar/desativar debug global
window.toggleGikamuraDebug()  // Alterna debug on/off
window.GIKAMURA_DEBUG         // Verificar estado atual

// Debug persistente (salvo no localStorage)
localStorage.setItem('gikamura_debug', 'true')
```

### Logs e Monitoramento
Para debug, monitore:
- Console do Service Worker (Application tab)
- Network requests para GitHub API (raw.githubusercontent.com)
- LocalStorage e IndexedDB
- Worker messages no console
- Debug logs quando `window.GIKAMURA_DEBUG` estiver ativo

### Problemas Conhecidos
1. **Web Workers**: Não podem usar ES6 modules (`import`/`export`) - usar `importScripts()`
2. **localStorage em Workers**: Workers não têm acesso ao localStorage - gerenciar cache no contexto principal
3. **SmartAutocomplete**: Pode interferir com busca principal - temporariamente desabilitado (app.js:117)
4. **Tailwind CDN**: Warning sobre uso em produção - considerar PostCSS build
5. **Periodic Sync**: Pode não ser permitido em alguns navegadores/contextos

### Debugging Cards Não Renderizando
Se os cards não aparecem:
1. Verificar se Worker está executando (`update-worker.js` messages no console)
2. Verificar fetch para GitHub Raw no Network tab
3. Verificar se `store.allManga` está sendo populado
4. Verificar se localStorage tem dados de cache válidos

### Performance
- Processamento em lotes (100 itens por vez)
- Web Workers evitam bloqueio da UI
- Cache inteligente com versionamento reduz requests desnecessários
- Lazy loading para otimização de recursos
- Debounce inteligente para busca e interações
- Analytics locais para monitoramento sem overhead externo

## Funcionalidades Avançadas

### Sistema de Notificações
- Service Worker com sincronização periódica (6 horas)
- Notificações consolidadas para melhor UX
- Sistema de marcação de lido/não lido
- Suporte a Periodic Background Sync API

### Gestos e Navegação
- Touch gestures para navegação em dispositivos móveis
- Sistema responsivo com feedback tátil
- Navegação otimizada para diferentes tipos de tela

### Cache e Performance
- Sistema de cache em múltiplas camadas (localStorage + IndexedDB)
- Versionamento inteligente de dados
- Processamento assíncrono em Web Workers
- Lazy loading de recursos sob demanda

## Melhores Práticas para Desenvolvimento

### Web Workers
- **NUNCA** use `import`/`export` em Web Workers - use `importScripts()`
- **NUNCA** acesse `localStorage` dentro de Workers - mova para contexto principal
- Mantenha Workers simples e focados em processamento de dados
- Use `postMessage()` para comunicação bidirecional

### Cache e Estado
- Sempre gerencie cache no contexto principal (`app.js`)
- Use versionamento para invalidar cache quando necessário
- Monitore o tamanho do localStorage (limite ~5-10MB)

### Debugging e Performance
- Use `console.log` para rastrear fluxo de Workers
- Monitore Network tab para requests ao GitHub Raw
- Verifique Application tab para Service Worker status
- Use DevTools Performance para identificar gargalos

## Fluxo de Trabalho (Workflow)

### Desenvolvimento Recomendado
1. **Desenvolver localmente**
   ```bash
   python -m http.server 8000
   # Teste em http://localhost:8000
   ```

2. **Deploy para RC (teste)**
   ```bash
   git add -A && git commit -m "feat: nova funcionalidade"
   ./scripts/deploy.sh rc
   # Teste em https://gikamura.github.io/rc/
   ```

3. **Validar no RC**
   - Testar funcionalidade completa
   - Verificar workflows CI/CD
   - Validar PWA features

4. **Deploy para Produção**
   ```bash
   ./scripts/deploy.sh production
   # Live em https://gikamura.github.io/reader/
   ```

### Monitoramento de Workflows
```bash
# Ver status de ambos ambientes
./scripts/setup-env.sh status

# Monitorar workflows via GitHub CLI
gh run list --repo gikamura/reader --limit 3  # Produção
gh run list --repo gikamura/rc --limit 3      # RC

# Ver detalhes de um workflow específico
gh run view --repo gikamura/reader <run-id>

# Verificar status de deploy em tempo real
gh run watch --repo gikamura/reader
```

## Comandos de Manutenção

### Limpeza e Reset
```bash
# Limpar cache do navegador manualmente
# No DevTools: Application > Storage > Clear Storage

# Reset total da aplicação (localStorage)
localStorage.clear()

# Forçar reload sem cache
Ctrl+Shift+R (ou Cmd+Shift+R no Mac)
```

### Monitoramento de Performance
```bash
# Verificar tamanho dos arquivos principais
du -h *.js *.css *.html

# Monitorar uso de localStorage (no console do navegador)
console.log(JSON.stringify(localStorage).length + ' bytes')

# Verificar Service Worker status
navigator.serviceWorker.getRegistrations().then(regs => console.log(regs))
```