#!/usr/bin/env node

/**
 * Script para configurar variáveis de ambiente
 * Uso: node scripts/setup-env.js
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');
const ENV_EXAMPLE = path.join(__dirname, '..', '.env.example');

function setupEnvironment() {
    console.log('🔧 Configurando ambiente...');

    // Verificar se .env já existe
    if (fs.existsSync(ENV_FILE)) {
        console.log('✅ Arquivo .env já existe');
        return;
    }

    // Verificar se .env.example existe
    if (!fs.existsSync(ENV_EXAMPLE)) {
        console.error('❌ Arquivo .env.example não encontrado');
        process.exit(1);
    }

    // Copiar .env.example para .env
    try {
        fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
        console.log('✅ Arquivo .env criado a partir do .env.example');
        console.log('📝 Por favor, edite o arquivo .env com suas configurações reais');
    } catch (error) {
        console.error('❌ Erro ao criar arquivo .env:', error.message);
        process.exit(1);
    }
}

function validateEnvironment() {
    console.log('🔍 Validando variáveis de ambiente...');

    const requiredVars = [
        'GITHUB_TOKEN',
        'API_BASE_URL',
        'CORS_PROXY_URL'
    ];

    const missingVars = [];

    // Carregar .env se existir
    if (fs.existsSync(ENV_FILE)) {
        const envContent = fs.readFileSync(ENV_FILE, 'utf8');
        const envVars = {};

        envContent.split('\n').forEach(line => {
            if (line.trim() && !line.startsWith('#')) {
                const [key, value] = line.split('=');
                if (key && value) {
                    envVars[key.trim()] = value.trim();
                }
            }
        });

        requiredVars.forEach(varName => {
            if (!envVars[varName] || envVars[varName] === 'your_github_pat_here' || envVars[varName] === 'your_analytics_id_here') {
                missingVars.push(varName);
            }
        });
    } else {
        missingVars.push(...requiredVars);
    }

    if (missingVars.length > 0) {
        console.log('⚠️  Variáveis não configuradas:');
        missingVars.forEach(varName => {
            console.log(`   - ${varName}`);
        });
        console.log('\n📝 Por favor, configure essas variáveis no arquivo .env');
    } else {
        console.log('✅ Todas as variáveis obrigatórias estão configuradas');
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const command = process.argv[2];

    switch (command) {
        case 'setup':
            setupEnvironment();
            break;
        case 'validate':
            validateEnvironment();
            break;
        default:
            console.log('Uso:');
            console.log('  node scripts/setup-env.js setup    - Criar arquivo .env');
            console.log('  node scripts/setup-env.js validate - Validar configurações');
            break;
    }
}

module.exports = {
    setupEnvironment,
    validateEnvironment
};