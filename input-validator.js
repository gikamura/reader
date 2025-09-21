/**
 * Sistema robusto de validação de entrada
 * Previne XSS, injection attacks e garante integridade dos dados
 */

export class InputValidator {
    static instance = null;

    constructor() {
        if (InputValidator.instance) {
            return InputValidator.instance;
        }

        this.config = {
            maxStringLength: 10000,
            maxArrayLength: 1000,
            allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
            blockedPatterns: [
                /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                /javascript:/gi,
                /on\w+\s*=/gi,
                /<iframe/gi,
                /<object/gi,
                /<embed/gi
            ]
        };

        InputValidator.instance = this;
    }

    /**
     * Validação de strings com sanitização XSS
     */
    validateString(input, options = {}) {
        if (typeof input !== 'string') {
            if (input === null || input === undefined) {
                return options.defaultValue || '';
            }
            input = String(input);
        }

        const maxLength = options.maxLength || this.config.maxStringLength;
        const allowEmpty = options.allowEmpty !== false;
        const trim = options.trim !== false;

        // Trim se necessário
        if (trim) {
            input = input.trim();
        }

        // Verificar se vazio é permitido
        if (!allowEmpty && input.length === 0) {
            throw new Error('String vazia não é permitida');
        }

        // Verificar comprimento
        if (input.length > maxLength) {
            if (options.truncate) {
                input = input.substring(0, maxLength);
            } else {
                throw new Error(`String muito longa. Máximo permitido: ${maxLength} caracteres`);
            }
        }

        // Verificar padrões perigosos
        for (const pattern of this.config.blockedPatterns) {
            if (pattern.test(input)) {
                if (options.allowUnsafe) {
                    console.warn('Conteúdo potencialmente perigoso detectado mas permitido:', input.substring(0, 100));
                } else {
                    throw new Error('Conteúdo perigoso detectado na entrada');
                }
            }
        }

        // Sanitizar HTML se necessário
        if (options.sanitizeHtml !== false) {
            input = this.sanitizeHtml(input);
        }

        return input;
    }

    /**
     * Sanitização básica de HTML
     */
    sanitizeHtml(html) {
        if (typeof html !== 'string') return '';

        // Escape de caracteres básicos
        html = html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');

        return html;
    }

    /**
     * Validação de URLs
     */
    validateUrl(url, options = {}) {
        if (!url || typeof url !== 'string') {
            if (options.required) {
                throw new Error('URL é obrigatória');
            }
            return null;
        }

        url = url.trim();

        try {
            const parsed = new URL(url);

            // Verificar protocolos permitidos
            const allowedProtocols = options.allowedProtocols || ['https:', 'http:'];
            if (!allowedProtocols.includes(parsed.protocol)) {
                throw new Error(`Protocolo não permitido: ${parsed.protocol}`);
            }

            // Verificar domínios bloqueados
            const blockedDomains = options.blockedDomains || [];
            if (blockedDomains.some(domain => parsed.hostname.includes(domain))) {
                throw new Error(`Domínio bloqueado: ${parsed.hostname}`);
            }

            // Verificar domínios permitidos
            const allowedDomains = options.allowedDomains;
            if (allowedDomains && !allowedDomains.some(domain =>
                parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
            )) {
                throw new Error(`Domínio não permitido: ${parsed.hostname}`);
            }

            return url;
        } catch (error) {
            throw new Error(`URL inválida: ${error.message}`);
        }
    }

    /**
     * Validação de números
     */
    validateNumber(input, options = {}) {
        if (input === null || input === undefined) {
            if (options.required) {
                throw new Error('Número é obrigatório');
            }
            return options.defaultValue;
        }

        const num = typeof input === 'number' ? input : Number(input);

        if (isNaN(num) || !isFinite(num)) {
            throw new Error('Valor não é um número válido');
        }

        if (options.min !== undefined && num < options.min) {
            throw new Error(`Número deve ser maior que ${options.min}`);
        }

        if (options.max !== undefined && num > options.max) {
            throw new Error(`Número deve ser menor que ${options.max}`);
        }

        if (options.integer && !Number.isInteger(num)) {
            throw new Error('Número deve ser um inteiro');
        }

        return num;
    }

    /**
     * Validação de arrays
     */
    validateArray(input, options = {}) {
        if (!Array.isArray(input)) {
            if (options.required) {
                throw new Error('Array é obrigatório');
            }
            return options.defaultValue || [];
        }

        const maxLength = options.maxLength || this.config.maxArrayLength;

        if (input.length > maxLength) {
            throw new Error(`Array muito grande. Máximo permitido: ${maxLength} elementos`);
        }

        // Validar elementos se necessário
        if (options.elementValidator) {
            return input.map((item, index) => {
                try {
                    return options.elementValidator(item);
                } catch (error) {
                    throw new Error(`Erro no elemento ${index}: ${error.message}`);
                }
            });
        }

        return input;
    }

    /**
     * Validação de objetos
     */
    validateObject(input, schema, options = {}) {
        if (!input || typeof input !== 'object') {
            if (options.required) {
                throw new Error('Objeto é obrigatório');
            }
            return options.defaultValue || {};
        }

        const validatedObject = {};

        for (const [key, validator] of Object.entries(schema)) {
            try {
                if (typeof validator === 'function') {
                    validatedObject[key] = validator(input[key]);
                } else {
                    // Validator é um objeto com configurações
                    const value = input[key];
                    const config = validator;

                    if (config.required && (value === undefined || value === null)) {
                        throw new Error(`Campo '${key}' é obrigatório`);
                    }

                    if (value !== undefined && value !== null) {
                        switch (config.type) {
                            case 'string':
                                validatedObject[key] = this.validateString(value, config);
                                break;
                            case 'number':
                                validatedObject[key] = this.validateNumber(value, config);
                                break;
                            case 'url':
                                validatedObject[key] = this.validateUrl(value, config);
                                break;
                            case 'array':
                                validatedObject[key] = this.validateArray(value, config);
                                break;
                            default:
                                validatedObject[key] = value;
                        }
                    } else if (config.defaultValue !== undefined) {
                        validatedObject[key] = config.defaultValue;
                    }
                }
            } catch (error) {
                throw new Error(`Validação falhou para '${key}': ${error.message}`);
            }
        }

        return validatedObject;
    }

    /**
     * Validação específica para dados de mangá
     */
    validateMangaData(mangaData) {
        const schema = {
            title: {
                type: 'string',
                required: true,
                maxLength: 500,
                trim: true
            },
            url: {
                type: 'url',
                required: true,
                allowedDomains: ['cubari.moe']
            },
            description: {
                type: 'string',
                maxLength: 2000,
                truncate: true,
                defaultValue: ''
            },
            imageUrl: {
                type: 'url',
                allowedProtocols: ['https:', 'http:'],
                defaultValue: 'https://placehold.co/256x384/1f2937/7ca3f5?text=Sem+Capa'
            },
            author: {
                type: 'string',
                maxLength: 200,
                defaultValue: ''
            },
            artist: {
                type: 'string',
                maxLength: 200,
                defaultValue: ''
            },
            genres: {
                type: 'array',
                maxLength: 20,
                elementValidator: (genre) => this.validateString(genre, { maxLength: 50 })
            },
            type: {
                type: 'string',
                allowEmpty: true,
                defaultValue: null
            },
            status: {
                type: 'string',
                maxLength: 50,
                defaultValue: ''
            },
            lastUpdated: {
                type: 'number',
                min: 0,
                defaultValue: 0
            },
            chapterCount: {
                type: 'number',
                min: 0,
                integer: true,
                defaultValue: 0
            }
        };

        return this.validateObject(mangaData, schema);
    }

    /**
     * Validação para dados de usuário (favoritos, configurações)
     */
    validateUserData(userData, type) {
        switch (type) {
            case 'favorites':
                return this.validateArray(userData, {
                    elementValidator: (url) => this.validateUrl(url, {
                        required: true,
                        allowedDomains: ['cubari.moe']
                    })
                });

            case 'settings':
                const settingsSchema = {
                    notificationsEnabled: {
                        type: 'boolean',
                        defaultValue: true
                    },
                    popupsEnabled: {
                        type: 'boolean',
                        defaultValue: true
                    },
                    theme: {
                        type: 'string',
                        maxLength: 20,
                        defaultValue: 'auto'
                    }
                };
                return this.validateObject(userData, settingsSchema);

            default:
                throw new Error(`Tipo de dados de usuário desconhecido: ${type}`);
        }
    }

    /**
     * Validação de entrada de busca
     */
    validateSearchQuery(query) {
        return this.validateString(query, {
            maxLength: 100,
            trim: true,
            allowEmpty: true,
            defaultValue: ''
        });
    }

    /**
     * Escape para uso em regex
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Validação de dados JSON vindos de APIs externas
     */
    validateApiResponse(response, expectedSchema) {
        if (!response) {
            throw new Error('Resposta da API está vazia');
        }

        if (typeof response !== 'object') {
            throw new Error('Resposta da API não é um objeto válido');
        }

        // Verificar se há propriedades obrigatórias
        const requiredFields = Object.keys(expectedSchema).filter(
            key => expectedSchema[key].required
        );

        for (const field of requiredFields) {
            if (!(field in response)) {
                throw new Error(`Campo obrigatório '${field}' está ausente na resposta da API`);
            }
        }

        return this.validateObject(response, expectedSchema, { allowExtra: true });
    }
}

// Instância singleton
export const inputValidator = new InputValidator();

// Exports de conveniência
export const validateString = (input, options) => inputValidator.validateString(input, options);
export const validateUrl = (input, options) => inputValidator.validateUrl(input, options);
export const validateNumber = (input, options) => inputValidator.validateNumber(input, options);
export const validateArray = (input, options) => inputValidator.validateArray(input, options);
export const validateObject = (input, schema, options) => inputValidator.validateObject(input, schema, options);
export const validateMangaData = (input) => inputValidator.validateMangaData(input);
export const validateUserData = (input, type) => inputValidator.validateUserData(input, type);
export const validateSearchQuery = (input) => inputValidator.validateSearchQuery(input);
export const sanitizeHtml = (input) => inputValidator.sanitizeHtml(input);