# my Home by norty — Guia do repositório

Plataforma de gestão condominial. Esta é a **Fase 1**: MVP navegável com
arquitetura de produto real e banco de dados provisório.

## Comandos

```bash
npm run dev      # desenvolvimento
npm run build    # tsc -b && vite build
npm run lint     # oxlint
npm run preview  # serve o build
```

## Regras de arquitetura

1. **Nenhum componente acessa `data/db.ts` diretamente.**
   O caminho é sempre `UI → services → repositories → db`. Isso é o que
   permitirá trocar o banco provisório pelo definitivo na Fase 2 sem tocar na UI.

2. **O dataset é gerado, não persistido.**
   `data/seed/generate.ts` reconstrói o condomínio a partir de uma semente fixa
   a cada carregamento; só as alterações da sessão vão para o `localStorage`
   como journal de operações. Ao mexer no seed, lembre que ele precisa
   permanecer determinístico — use apenas o `Rng` de `seed/random.ts`.

3. **Estilo vem de tokens.**
   Cores, espaçamento, tipografia, raios e sombras estão em `styles/tokens.css`.
   Não introduza valores literais em CSS de módulo; use as variáveis.
   A paleta é preto + dourado e os papéis são fixos: grafite (`--mh-ink`)
   carrega ação primária e texto, dourado (`--mh-gold`) é acento, vermelho
   (`--danger`) é só alerta real. Sobre dourado o texto é **preto** — nunca
   branco, que não atinge contraste.
   Componentes reutilizáveis moram em `components/ui` e são estilizados em
   `components/ui/ui.css` — evite duplicar CSS nos módulos.

4. **Permissão antes de rota.**
   Toda rota protegida usa `RequirePermission`. A navegação (`app/navigation.ts`)
   é filtrada pela mesma matriz de `services/permissions.ts`. Ao criar um módulo,
   adicione a permissão correspondente nos dois lugares.

5. **Reatividade dos dados.**
   Consultas em componentes usam `useMemo` com `dataVersion` (de `useAuthenticated`)
   nas dependências — é assim que a UI recalcula após uma escrita no banco.

6. **Integrações simuladas devem parecer reais.**
   Pagamento, leitura de placa, portões, CFTV e IA são simulados nesta fase, mas
   com a mesma interface que a integração real terá. Ao simular algo novo,
   isole a simulação em um service e documente o ponto de troca.

## Papéis e rotas

| Papel | Home | Prefixo |
|---|---|---|
| morador | `/app` | `/app/*` |
| portaria | `/portaria` | `/portaria/*` |
| síndico / administrador | `/gestao` | `/gestao/*` |
| administradora | `/portfolio` | `/portfolio/*` |

Contas de demonstração: `morador@`, `portaria@`, `sindico@`, `admin@`,
`administradora@` `myhome.test` — senha `123456`.

## Idioma

Interface, comentários e commits em **português (pt-BR)**.
