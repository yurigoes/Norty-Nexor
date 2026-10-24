# Norty Car — Status da implementação

Atualizado em 24/10/2026. Legenda: ✅ implementado e testado · 🟡 implementado
com limitação declarada · 🔌 estrutura pronta, **pendente de credencial
externa** (nada é simulado) · ⏳ não implementado (planejado).

**Resumo:** todos os critérios de aceitação do item 36 executam com
persistência real e passam no teste automatizado `acceptance.test.ts`. Suíte:
131 testes de integração + 15 de regras, 0 falhas.

## Critérios de aceitação (item 36)

| Critério | Situação |
|---|---|
| Criar empresa e lojas | ✅ Master cria (com plano e proprietário); empresa cria filiais |
| Criar usuários e permissões | ✅ convite, perfis editáveis, filiais e alçada |
| Cadastrar veículo e cliente | ✅ com validação de placa, RENAVAM, chassi, CPF/CNPJ |
| Reservar e impedir reservas incompatíveis | ✅ restrição de exclusão no banco; corrida concorrente testada |
| Criar contrato e registrar caução | ✅ |
| Entregar com vistoria e fotos; motorista e quilometragem | ✅ entrega exige vistoria concluída |
| Trocar motorista/veículo preservando histórico | ✅ |
| OS com peças e atualização de estoque | ✅ transacional, sem saldo negativo |
| Cadastrar infração | ✅ com sugestão (não automática) de condutor |
| Cobrança e pagamento por fluxo validado | ✅ baixa idempotente; webhook assinado 🔌 provedor |
| Devolução com nova vistoria | ✅ com acerto final |
| Histórico da placa | ✅ linha do tempo imutável |
| Rentabilidade com dados disponíveis | ✅ declara o que falta |
| Portal do cliente | ✅ |
| Catálogo público | ✅ sem dados internos |
| Administrar empresas pelo Master | ✅ |
| Isolamento entre empresas | ✅ serviço + RLS forçado, testado |
| Testes críticos | ✅ |

## Por área do pedido

| # | Área | Situação |
|---|---|---|
| 2 | Identidade visual e design system | ✅ tokens, claro/escuro, Inter tabular, menu recolhível, estados, acessibilidade por teclado, animação do login |
| 3 | Arquitetura | ✅ monólito modular documentado; Redis não foi necessário (fila em PostgreSQL) |
| 4 | Multiempresa e login inteligente | ✅ contextos, troca sem novo login, recuperação de senha, sessões, bloqueio, MFA |
| 5 | Master Norty | ✅ empresas, planos, assinaturas e faturas SaaS (baixa manual), domínios, saúde, auditoria, suporte com acesso excepcional autorizado, equipe, configurações |
| 6 | Portal da empresa e perfis | ✅ 11 perfis-modelo editáveis, permissões granulares, visão consolidada por filial |
| 7 | Frota | ✅ catálogo e unidade separados, situações comercial/operacional, disponibilidade pela agenda, histórico, documentos com vencimento |
| 8 | Clientes e motoristas | ✅ PF/PJ, CNH com alertas, LGPD (exportar, anonimizar, mascarar) |
| 9 | Reservas e contratos | ✅ período e longo prazo, versões, prorrogação, aditivos, renovação, rescisão, troca de veículo; 🔌 assinatura eletrônica (assinatura em papel com anexo ✅) |
| 10 | Caução | ✅ separado da receita, aprovação por alçada |
| 11 | Vistorias | ✅ 4 modalidades, checklist configurável, mapa de avarias, fotos, assinatura, congelamento, comparação para revisão humana; 🔌 comparação visual por IA |
| 12 | Estoque | ✅ movimentos imutáveis e idempotentes, custo médio, transferência, inventário, compras e recebimento, reposição |
| 13 | Manutenção | ✅ OS com workflow, aprovação, peças, bloqueio de agenda, preventiva por km/tempo, pneus |
| 14 | Infrações | ✅ status administrativo e financeiro, histórico, prazos, documentos |
| 15 | Sinistros e seguros | ✅ com bloqueio do veículo e geração de OS |
| 16 | Financeiro | ✅ receber/pagar, baixa, estorno, conciliação, fluxo de caixa, centros de custo, inadimplência; 🔌 geração de Pix/boleto/cartão no provedor |
| 17 | Rentabilidade | ✅ |
| 18 | Abastecimento | ✅ com detecção de inconsistências |
| 19 | Site público e domínio próprio | ✅ site por empresa, catálogo, cotação, pedidos com consentimento, domínio com verificação DNS real e TLS sob demanda; 🟡 SEO de SPA (metatags no cliente + página Open Graph no servidor; sem pré-renderização) |
| 20 | Portal do cliente | ✅ |
| 21 | Visualizador 3D | 🟡 Three.js com rotação, zoom, pontos de interesse, troca de cor e fallback para fotos; **nenhum arquivo .glb acompanha o sistema** (deve ser enviado por modelo — ver VISUALIZADOR-3D.md); Draco/Meshopt não suportados |
| 22 | Dashboards | ✅ dados reais por permissão e filial; Master com painel próprio |
| 23 | Notificações e automações | ✅ central interna, rotinas agendadas sem duplicação, fila com tentativas, webhooks assinados; 🔌 e-mail (SMTP), 🔌 WhatsApp |
| 24 | Norty IA | 🔌 integração com ferramentas somente leitura e escopadas implementada; sem `ANTHROPIC_API_KEY` responde "não configurada". **Não testada com chave real** |
| 25 | Relatórios | ✅ 25 relatórios com permissão e filial; 🟡 exportação CSV (abre no Excel) e PDF pela impressão do navegador — não há geração nativa de .xlsx/.pdf |
| 26 | Auditoria | ✅ imutável, na mesma transação, com antes/depois e motivo |
| 27 | Segurança e LGPD | ✅ ver SEGURANCA-LGPD.md; 🟡 limitador de tentativas em memória (uma instância; para várias, usar armazenamento compartilhado) |
| 28 | Compra e venda | ✅ com checagens antes da baixa patrimonial |
| 29 | Integrações e API | ✅ API de leitura com chave e escopos, webhooks de saída assinados; 🔌 contabilidade, emissão fiscal, rastreamento, telemetria, mapas (sem conector) |
| 30 | PWA e campo | 🟡 instalável e com telas de campo para celular; ⏳ trabalho offline (desenho em PWA-OFFLINE.md, não prometido) |
| 31 | Modelo de dados | ✅ 86 tabelas, migrações versionadas |
| 32 | Regras obrigatórias (18) | ✅ todas cobertas por teste |

## Pendências de credenciais externas

Variáveis em `infra/norty-car/.env.example` e telas em Administração →
Integrações / Master → Integrações mostram a situação real de cada uma:

| Integração | O que falta |
|---|---|
| E-mail | `SMTP_HOST`, `SMTP_FROM` (e usuário/senha). Sem isso, convites e recuperação geram link para entrega em mãos |
| Provedor de pagamento | conta no provedor, segredo do webhook na empresa e o adaptador de criação de cobrança (`PaymentProvider`) para o provedor escolhido |
| Assinatura eletrônica | provedor contratado |
| WhatsApp | WhatsApp Business API autorizada |
| Norty IA | `ANTHROPIC_API_KEY` (e um teste real da comunicação) |
| Domínios próprios com HTTPS | Cloudflare for SaaS ou servidor com IP público para o Caddy |

## Riscos e limitações conhecidos

- **Imagens Docker não foram construídas neste ambiente** (a rede do sandbox
  não alcança os repositórios do Alpine). Os Dockerfiles seguem o padrão já
  usado pelo my Home, mas precisam de um primeiro build no servidor.
- Armazenamento de arquivos em disco (volume); o adaptador S3/MinIO está
  descrito, não implementado.
- Sem testes automatizados de interface no navegador; as telas foram
  revisadas por captura (desktop/celular, claro/escuro).
- Quadro de agenda da frota limitado a 200 veículos por consulta.
- O formulário de veículo ainda não oferece seletor de apólice (o vínculo é
  feito pela tela de Seguros).

## Próximos itens prioritários

1. Primeiro deploy em homologação (build das imagens, Cloudflare, SMTP).
2. Escolher e conectar o provedor de pagamento (Pix/boleto) e o de assinatura eletrônica.
3. Testar a Norty IA com chave real e medir custo por pergunta.
4. Modo offline da vistoria conforme PWA-OFFLINE.md.
5. Adaptador S3/MinIO para arquivos e limitador de tentativas compartilhado.
6. Testes de interface automatizados para os fluxos de balcão e vistoria.
