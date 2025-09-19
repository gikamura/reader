# Configurar GitHub Pages para RC

## 🔧 Steps para habilitar GitHub Pages no repositório RC

### 1. Acessar Configurações
1. Vá para: https://github.com/gikamura/rc
2. Clique em **Settings** (aba no topo)
3. Role para baixo até a seção **Pages** (lado esquerdo)

### 2. Configurar Source
Na seção **Pages**:
- **Source**: Selecione **"GitHub Actions"**
- **Branch**: Deixe como está (será controlado pelo workflow)

### 3. Aguardar Deploy
- O workflow vai executar automaticamente
- Aguarde 2-3 minutos
- A URL será: **https://gikamura.github.io/rc/**

### 4. Verificar Status
```bash
# Verificar workflows do RC
gh run list --repo gikamura/rc --limit 3

# Ver detalhes se falhar
gh run view [RUN_ID] --repo gikamura/rc
```

## ✅ Resultado Esperado

Após a configuração:
- ✅ **RC**: https://gikamura.github.io/rc/ (deploy automático)
- ✅ **Produção**: https://gikamura.github.io/reader/ (deploy automático)

## 🔄 Fluxo de Trabalho

1. **Desenvolver** → Commit local
2. **Deploy RC** → `./scripts/deploy.sh rc`
3. **Testar** → https://gikamura.github.io/rc/
4. **Deploy Produção** → `./scripts/deploy.sh production`
5. **Confirmar** → https://gikamura.github.io/reader/

## 🛠️ Workflows Ativos

Ambos repositórios terão:
- **CI**: Testes automáticos, validação JS, PWA checks
- **Deploy**: Build e deploy automático para GitHub Pages
- **Security**: Scan de segurança e auditoria

## 📊 Monitoramento

```bash
# Status geral
./scripts/setup-env.sh status

# Workflows produção
gh run list --repo gikamura/reader --limit 3

# Workflows RC
gh run list --repo gikamura/rc --limit 3
```