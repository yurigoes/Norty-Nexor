# Norty Car — Segurança e LGPD

## Autenticação e sessão

| Controle | Implementação |
|---|---|
| Senha | Argon2id; política mínima de 10 caracteres com letras e números |
| Força bruta | limite por IP nas rotas de credencial + bloqueio progressivo por conta (15 min na 5ª falha, dobrando até 24 h) |
| Enumeração de contas | mesma mensagem e tempo semelhante para e-mail inexistente e senha errada; recuperação responde igual exista ou não a conta |
| MFA | TOTP (RFC 6238), segredo cifrado (AES-256-GCM); obrigatório para a equipe Norty em produção |
| Sessão | access token de 15 min em memória; refresh em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, caminho restrito a `/v1/auth`, rotação a cada uso e hash no banco |
| Encerramento | logout, encerrar outras sessões, troca de senha encerra as demais, desativação de usuário encerra as sessões do vínculo |
| CSRF | rotas de estado usam token no cabeçalho `Authorization` (não enviado automaticamente pelo navegador); o cookie só é aceito na rota de refresh, protegida por SameSite e por CORS com lista de origens |

## Autorização

- Contexto resolvido no servidor a partir da sessão; empresa nunca vem do cliente.
- Permissão granular verificada em toda rota (`@RequirePermission`), escopo de
  filial nos serviços, alçada de valor para aprovações.
- RLS forçado no PostgreSQL como segunda barreira.
- Master Norty não lê dados operacionais. Acesso de suporte exige pedido com
  finalidade, escopo de leitura e prazo, autorizado por alguém da empresa,
  revogável, e aparece na auditoria da empresa.

## Entrada e saída

- `ValidationPipe` com `whitelist` e `forbidNonWhitelisted`: campo desconhecido é erro.
- Prisma parametriza todas as consultas; SQL cru só com template tag.
- Erros inesperados devolvem mensagem genérica em produção (sem stack nem texto do Postgres).
- `helmet`, CORS com credenciais restrito às origens configuradas, `trust proxy` de um salto.
- React escapa o conteúdo por padrão; o aplicativo não usa `dangerouslySetInnerHTML`
  para dados de usuário.

## Arquivos

Tipo pelo conteúdo (JPG, PNG, WebP, PDF, GLB), limite de tamanho, nome
sanitizado, chave aleatória, download sempre autorizado, URL temporária
assinada de 5 minutos, `X-Content-Type-Options: nosniff`, sem URL pública para
documento pessoal. Evidência de vistoria não pode ser removida.

## Segredos

`.env` fora do git; `JWT_SECRET` e `SECRETS_KEY` gerados no deploy; segredos
de integração cifrados em repouso e nunca devolvidos depois de criados; chaves
de API guardadas só como hash.

## Auditoria

Toda operação sensível grava, na mesma transação, quem, empresa, filial,
quando, ação, entidade, antes/depois (sem senhas, tokens ou segredos), IP,
user agent, id da requisição e motivo quando exigido. A tabela é imutável.

## LGPD

| Princípio | Como o sistema atende |
|---|---|
| Minimização | documento mascarado para quem não tem `customers.sensitive`; site público não expõe placa, cliente ou contrato |
| Finalidade e acesso restrito | permissões por perfil e filial; documentos pessoais com permissão própria |
| Direitos do titular | exportação dos dados pessoais do cliente (JSON), correção via solicitação no portal, anonimização quando não há contrato ativo nem título em aberto |
| Retenção | registros financeiros e históricos não são apagados pela aplicação; anonimização preserva o histórico sem identificar a pessoa |
| Consentimento | formulários do site exigem aceite explícito |
| Segurança | ver seções acima |
| Dados de cartão | não são armazenados; pagamento por cartão, quando houver, fica no provedor |

Dados pessoais não vão para URL, log público ou página indexável.
