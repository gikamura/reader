# Copilot Instructions - Gikamura Reader

## Visão Geral

PWA de leitura de mangás/manhwas/manhuas 100% frontend. Vanilla JS (ES Modules), Tailwind CSS via CDN, **sem build step**.

## Arquitetura de Módulos

```
app.js          → Ponto de entrada, inicializa Workers e Service Worker
store.js        → Estado centralizado com padrão observer/subscriber
ui.js           → Renderização DOM, getDOM() para queries cacheadas
api.js          → Processamento de dados, comunicação externa
cache.js        → localStorage + IndexedDB para persistência
shared-utils.js → Utilitários compartilhados (compatível com Workers via importScripts)
sw.js           → Service Worker para offline e sync periódico
update-worker.js→ Web Worker para processamento pesado
```

## Fluxo de Dados

1. `app.js` → `initializeStore()` → carrega cache → inicializa Workers
2. Worker busca dados do GitHub Raw → processa em lotes de 100 → `postMessage()`
3. Store atualiza → subscribers notificados → UI re-renderiza

## Comandos Essenciais

```bash
# Servir localmente
python -m http.server 8000

# Deploy RC (teste)
./scripts/deploy.sh rc  # → https://gikamura.github.io/rc/

# Deploy Produção
./scripts/deploy.sh production  # → https://gikamura.github.io/reader/
```

## Padrões Críticos

### Web Workers - NUNCA use ES6 modules
```javascript
// ❌ ERRADO - Workers não suportam ES6 modules
import { func } from './module.js';

// ✅ CORRETO - Use importScripts
importScripts('./shared-utils.js');
```

### Código Compartilhado
Use `shared-utils.js` para funções que precisam rodar em Workers E contexto principal:
- Detecta ambiente automaticamente (`typeof importScripts === 'function'`)
- Expõe via `self.SharedUtils` para Workers
- Expõe via `window.SharedUtils` para contexto principal

### Validação de Entrada (Segurança XSS)
```javascript
// SEMPRE use InputValidator para entrada de usuário
import { InputValidator } from './input-validator.js';
const validator = new InputValidator();
const safeInput = validator.validateString(userInput);
```

### Cache e Estado
- **NUNCA** acesse `localStorage` dentro de Workers - gerenciar em `app.js`
- Use `CacheCoordinator` para cache unificado entre contextos
- Cache tem duração de 6 horas (configurável em `constants.js`)

## Debugging

```javascript
// Ativar debug global
window.toggleGikamuraDebug()  // Alterna on/off
window.GIKAMURA_DEBUG         // Estado atual

// Persistente
localStorage.setItem('gikamura_debug', 'true')
```

### Problemas Comuns
- **Cards não renderizam**: Verificar `update-worker.js` messages no console, Network tab para GitHub Raw
- **Service Worker**: Application tab → Service Workers para status/logs
- **Cache corrompido**: `localStorage.clear()` + Ctrl+Shift+R

## Sistema de Notificações

### Detecção de Atualizações
- Usa `metadata.lastUpdated` do index para detectar mudanças (requisição leve)
- Compara `chapter.last_updated` (timestamp Unix em segundos) com `lastCheckTimestamp` local
- Verificação periódica a cada 5 minutos (`UPDATE_CHECK_INTERVAL_MS`)
- Pausa quando aba não está visível (economia de recursos)

### Funcionalidades
- **Badge no favicon**: Mostra número de atualizações não lidas
- **Som de notificação**: Opcional, usa Web Audio API (dois tons)
- **Popup de atualização**: Botão flutuante quando há novidades
- **Aba Updates**: Histórico separado por tipo (novas obras / novos capítulos)

### Configurações (em `settings`)
```javascript
{
  notificationsEnabled: true,  // Verificar atualizações
  popupsEnabled: true,         // Mostrar popups
  soundEnabled: false          // Som de notificação
}
```

## Dados Externos

- **Source**: `raw.githubusercontent.com` (sem CORS blocking)
- **Index URL**: `INDEX_URL` em `constants.js`
- **Formato**: Processa URLs Cubari.moe → JSON do GitHub

### Estruturas de JSON

**Index Principal** (`metadata` + `mangas`):
```json
{
  "metadata": { "version": "1.0.4", "lastUpdated": 1759256696, "totalMangas": 1085 },
  "mangas": { "KR1017": { "title": "...", "chapters": [{ "type": "manhwa", ... }] } }
}
```

**Index de Scans** (`scan_info` + `works`):
```json
{
  "scan_info": { "name": "...", "version": "1.0.0", "total_works": 536 },
  "works": { "vajp_f11442": { "chapters": [{ "type": "manga", ... }] } }
}
```

**Detalhes da Obra** (API Cubari):
```json
{
  "title": "...", "status": "OnGoing",
  "chapters": { "203": { "last_updated": "1758931338", ... } }
}
```

## Testes e CI

```bash
# Validar sintaxe JS
find . -name "*.js" -not -path "./node_modules/*" | xargs -I {} node -c "{}"

# Validar manifest
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```

CI/CD via GitHub Actions: `.github/workflows/ci.yml` e `.github/workflows/deploy.yml`
