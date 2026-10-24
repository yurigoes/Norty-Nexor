# Norty Car — Testes

```bash
npm run test:car
```

Roda as regras puras (`packages/car-shared`, sem banco) e a suíte de
integração (`apps/car-api/test`), que sobe a **API compilada** contra o
PostgreSQL de teste (`nortycar_test`, ou `TEST_DATABASE_URL`) e fala HTTP de
verdade — guards, validação, RLS, restrições e gatilhos do banco inclusos.
Cada arquivo cria as próprias empresas com nomes únicos; nada depende de dado
prévio. Placas, CPFs, RENAVAMs e chassis são gerados sinteticamente com dígito
verificador válido.

## Situação

| Arquivo | Testes | Cobre |
|---|---|---|
| `car-shared/test/rules.test.ts` | 15 | dinheiro em centavos, CPF/CNPJ/placa/RENAVAM/chassi, cotação, atraso e km, mensalidades, caução, encargos, custo médio, manutenção, abastecimento, rentabilidade, permissões |
| `foundation.test.ts` | 18 | RLS em toda tabela de empresa, isolamento A↔B, auditoria imutável, login, bloqueio progressivo, rotação de refresh, logout, troca de contexto, chave forjada, MFA do Master, escopo de filial, último administrador, convite |
| `fleet.test.ts` | 15 | cadastro e duplicidade, isolamento por id, filial não autorizada, bloqueio/liberação com permissão, disponibilidade com preparo, exclusão lógica, CPF, mascaramento, anonimização LGPD, documentos a vencer |
| `rentals.test.ts` | 15 | **duas confirmações simultâneas → uma 409**, preparo entre locações, bloqueado/vendido não reserva, retirada vira contrato, entrega exige vistoria, troca de motorista e de veículo preservando histórico, alçada, mensalidades sem duplicar |
| `finance.test.ts` | 13 | idempotência de baixa (inclusive concorrente), webhook com evento repetido e assinatura inválida, caução fora da receita, dedução com aprovação, falha de pagamento não mexe no contrato, estorno |
| `operations.test.ts` | 19 | saldo insuficiente, **duas saídas simultâneas**, idempotência e imutabilidade do movimento, transferência, custo médio, compra, OS bloqueando a agenda, alçada, peça na linha do tempo, vistoria congelada, comparação, pneus, km regressivo |
| `regularization.test.ts` | 9 | indicação de condutor com permissão, sugestão pelo contrato vigente, histórico da infração, venda recusada com contrato ativo, vendido some da disponibilidade, sinistro bloqueia |
| `insights.test.ts` | 15 | relatórios por permissão e filial, exportação, rotina sem duplicar alertas, audiência das notificações, busca isolada, dashboard zerado, IA sem chave → 503 |
| `portals.test.ts` | 11 | Master cria empresa, PLATFORM sem dado operacional, suspensão/reativação, fluxo de suporte somente leitura e revogação, portal isolado por cliente, site despublicado, catálogo sem placa, consentimento, domínio único e TLS sob demanda, chave de API e segredo de webhook |
| `acceptance.test.ts` | 16 | **roteiro completo do item 36**, encadeado só por HTTP (abaixo) |
| **Total** | **146** | 131 de integração + 15 de regras — todos passando |

## Roteiro de aceitação (`acceptance.test.ts`)

1. Master com MFA cria a empresa; o proprietário define a senha pelo link.
2. Segunda filial, usuários por perfil, tarifa e serviço adicional.
3. Veículos, cliente PF e motoristas.
4. Cotação do servidor, reserva, **conflito recusado** e corrida concorrente com um só vencedor.
5. Retirada → contrato, caução, vistoria de entrega com foto real, ativação.
6. Troca de motorista e de veículo com as vistorias exigidas; intervalos preservados.
7. OS com peça do estoque: saldo cai e a peça entra na linha do tempo.
8. Infração com sugestão do condutor correto do período.
9. Cobrança e baixa idempotente.
10. Devolução com vistoria e acerto final.
11. Histórico da placa completo.
12. Rentabilidade com aviso de dado faltante.
13. Portal do cliente isolado.
14. Site publicado sem dados internos.
15. Isolamento total entre empresas (ids, listas, busca, edição).
16. Download da foto da vistoria com os bytes da imagem.

## Verificação do aplicativo web

`npm run lint -w @nortycar/web` (oxlint + TypeScript) e
`npm run build -w @nortycar/web`. As telas foram conferidas por captura de
tela em desktop e celular, nos temas claro e escuro, incluindo o assistente de
nova reserva percorrido até a confirmação.

## O que não é coberto por teste automatizado

- Envio real de e-mail, cobrança em provedor de pagamento, assinatura
  eletrônica, WhatsApp e chamada real à Norty IA (dependem de credenciais).
- Verificação de DNS contra domínio real (testada com domínio marcado no banco).
- Build das imagens Docker (validado fora deste ambiente — ver status).
- Testes de interface automatizados (end-to-end no navegador) — revisão por captura.
