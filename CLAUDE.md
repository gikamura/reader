# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- **update-worker.js**: Web Worker para processamento assíncrono de dados

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

### Estrutura de Testes
Não há testes automatizados configurados. A aplicação deve ser testada manualmente através do navegador.

### Build/Deploy
Não há processo de build. Os arquivos são servidos diretamente como estão. Para deploy:
```bash
# A aplicação é totalmente estática - todos os arquivos podem ser hospedados em qualquer CDN ou servidor estático
# Requisitos: HTTPS obrigatório para Service Workers em produção
```

## Características Técnicas

### Dados Externos
- **Source**: GitHub API (`INDEX_URL` em constants.js)
- **Proxy**: Usa múltiplos proxies CORS para acesso a imagens
- **Formato**: Processa URLs do Cubari.moe para acessar dados JSON

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
- **CORS**: Dependente de proxies externos para algumas funcionalidades
- **Cache**: Limpeza manual pode ser necessária durante desenvolvimento
- **Workers**: Requer suporte moderno do navegador

## Debugging

Para debug, monitore:
- Console do Service Worker (Application tab)
- Network requests para GitHub API
- LocalStorage e IndexedDB
- Worker messages no console

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