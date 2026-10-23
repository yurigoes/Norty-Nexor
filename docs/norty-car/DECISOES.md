# Norty Car — Decisões de arquitetura

Registro curto das decisões fundamentais: o contexto, a escolha e o que se
abriu mão. Decisão nova entra no fim, com número sequencial.

### 1. Produto irmão no monorepo do my Home
**Contexto.** O repositório já tinha o my Home funcionando (NestJS, Prisma,
React). **Decisão.** Criar o Norty Car como pacotes próprios
(`packages/car-shared`, `apps/car-api`, `apps/car-web`), reaproveitando a
stack e os padrões de segurança, sem tocar no my Home. **Custo.** Dois Prisma
Clients no mesmo `node_modules`: o do Norty Car é gerado em
`apps/car-api/src/generated` (fora do `node_modules`, que o npm limparia).

### 2. Monólito modular, não microsserviços
Reserva, agenda, contrato, caução e cobrança precisam de uma transação só.
Um banco e uma API mantêm isso simples. Fronteiras de módulo e serviços
injetados permitem extrair um módulo no futuro, se a escala pedir.

### 3. PostgreSQL com RLS forçado como segunda barreira
O filtro por empresa nos serviços é a primeira barreira; o RLS é a que
sobra quando alguém esquece a primeira. `FORCE` faz valer para o dono das
tabelas. O usuário do banco não pode ser superusuário nem ter `BYPASSRLS`.
O bypass existe só em `PrismaService.platform()`.

### 4. Disponibilidade por restrição de exclusão
Em vez de "consultar e depois inserir" (sujeito a corrida), a agenda do carro
é uma tabela de intervalos com `EXCLUDE USING gist`. O banco é a autoridade;
a aplicação traduz a violação em 409 com o conflito encontrado.

### 5. Contexto na sessão, não no cabeçalho
O token carrega identificadores; o contexto (empresa, vínculo, cliente,
acesso de suporte) fica gravado na sessão e é relido do banco a cada
requisição. Trocar de contexto reemite o token sem novo login; revogar um
vínculo derruba o acesso na próxima requisição.

### 6. Perfis-modelo editáveis + permissões granulares + módulos por plano
Os onze perfis pedidos nascem como modelos de cada empresa e podem ser
editados. Permissão efetiva = perfil ∩ módulos do plano. Alçada de valor fica
no vínculo do usuário, não no perfil, porque dois gerentes com o mesmo perfil
podem ter limites diferentes.

### 7. Imutabilidade por gatilho
Histórico, auditoria, movimentações e versões não se editam: o banco recusa
UPDATE/DELETE. Correção é um novo registro (estorno, adendo, nova versão).
Política de retenção, quando houver, roda por papel administrativo próprio,
fora da API.

### 8. Caução como obrigação, não receita
Caução tem tabela e saldo próprios (`security_deposits`, `deposit_entries`).
Só a parte utilizada por um desconto **aprovado** vira receita, e isso acontece
compensando um título — nunca por reclassificação silenciosa.

### 9. Pagamento confirmado só pelo servidor
Baixa manual por quem tem `finance.settle` (com idempotência) ou webhook
assinado do provedor (com unicidade do evento). Retorno do navegador nunca
confirma pagamento. Sem provedor configurado, o fluxo de cobrança online fica
"pendente de configuração".

### 10. Integrações honestas
SMTP, provedor de pagamento, assinatura eletrônica, WhatsApp e IA têm
estrutura pronta e status real: *pendente de configuração*, *configurada, não
testada*, *comunicação verificada* ou *falha*. Nada é simulado.

### 11. Arquivos pela API, tipo pelo conteúdo
Upload validado pelos bytes, download sempre autorizado pela entidade dona,
URL temporária assinada para imagens. Driver de disco local com contrato de
armazenamento de objetos (troca por S3/MinIO documentada).

### 12. Um bundle web, quatro superfícies
Equipe, portal do cliente, Master e sites públicos compartilham design system
e cliente HTTP. O host decide: hosts do aplicativo abrem o app; os demais são
sites de locadora, resolvidos pela API (domínio verificado ou subdomínio Norty).
**Custo.** SEO de SPA: metatags por página no cliente e rota de compartilhamento
com Open Graph no servidor; pré-renderização fica como evolução.

### 13. Dinheiro em centavos, datas em UTC
`Decimal(12,2)` no banco, centavos inteiros nas contas, `timestamptz` para
instantes, `date` para vencimentos, exibição no fuso da empresa.

### 14. Testes contra banco real
As regras críticas (RLS, sobreposição, idempotência, imutabilidade) vivem no
banco; mocks não as testariam. A suíte de integração sobe a API compilada
contra o `nortycar_test` e fala HTTP de verdade.
