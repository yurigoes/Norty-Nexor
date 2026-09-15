// Configuração de lint do monorepo — formato plano (ESLint 10).
//
// Um arquivo só, na raiz, em vez de três: as regras que valem para o
// domínio compartilhado são as mesmas que valem para quem o consome, e
// três arquivos divergem no primeiro ajuste que alguém esquece de
// replicar. O que muda de pacote para pacote é o ambiente — Node na
// API, navegador no aplicativo — e isso cabe em blocos.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    // Nada gerado entra no lint: o cliente do Prisma e os build são
    // artefato, e apontar erro em artefato só ensina a ignorar erro.
    ignores: [
      '**/dist/**',
      '**/dist-test/**',
      '**/node_modules/**',
      'apps/api/prisma/generated/**',
      'packages/shared/dist/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Variável não usada é sinal de refatoração pela metade. O
      // prefixo `_` é a saída explícita para o que existe só para
      // satisfazer uma assinatura.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` apaga o TypeScript no ponto exato em que ele seria útil.
      // Aviso, não erro: a fronteira com biblioteca sem tipo às vezes
      // exige, e transformar em erro só produziria `eslint-disable`.
      '@typescript-eslint/no-explicit-any': 'warn',

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // --- API: Node ------------------------------------------------------
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // O Nest injeta por decorador; o construtor com parâmetros
      // `private readonly` é o padrão do framework, não descuido.
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  // A suíte fala com o banco de verdade e loga o que precisa.
  {
    files: ['apps/api/test/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // --- Aplicativo: navegador + React ----------------------------------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // A regra que mais importa aqui, promovida de aviso a erro.
      // `CLAUDE.md` manda pôr `dataVersion` nas dependências do
      // `useMemo`; é esta regra que verifica que ninguém esqueceu — e o
      // esquecimento produz tela que não atualiza, o defeito mais
      // difícil de reproduzir. Hoje o código passa limpo nela: virar
      // erro não custa nada agora e tranca o comportamento.
      'react-hooks/exhaustive-deps': 'error',

      // Aviso, não erro, e a razão é longa porque a decisão não é
      // óbvia. A regra é nova (plugin v7, da era do React Compiler) e
      // acusa 33 pontos, de dois tipos bem diferentes:
      //
      //  1. `void carregar().catch(() => setErro(...))` — a maioria.
      //     Escrever estado dentro do `catch` de uma promessa não é o
      //     "setState síncrono no corpo do efeito" que a mensagem
      //     descreve: não há renderização em cascata. Aqui a regra
      //     erra.
      //  2. `setLinhas(null)` no topo do efeito, antes de buscar — é o
      //     que a regra realmente mira. É deliberado: zera para o
      //     esqueleto quando o filtro muda. Existe jeito melhor (`key`
      //     ou estado derivado), e são onze telas.
      //
      // Calar seria mentir sobre o segundo grupo; virar erro seria
      // refatorar cinquenta telas dentro de uma tarefa que era "fazer
      // o lint rodar", com risco de regressão em tudo que já foi
      // validado no navegador. Fica como aviso, visível, para virar
      // tarefa própria.
      'react-hooks/set-state-in-effect': 'warn',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // --- Domínio compartilhado ------------------------------------------
  {
    files: ['packages/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
