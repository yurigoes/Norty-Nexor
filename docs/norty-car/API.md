# Norty Car — API de integração e webhooks

Base: `https://<api>/v1`. Todas as respostas em JSON (UTF-8); datas em ISO 8601 (UTC);
valores em reais com duas casas.

## Autenticação por chave de API

Crie a chave em **Administração › Integrações › Chaves de API** (permissão
`integrations.manage`). A chave aparece **uma única vez**:

```
nc_live_<prefixo de 10>_<segredo de 32>
```

O servidor guarda só o prefixo e o hash SHA-256. Envie em toda chamada:

```
Authorization: ApiKey nc_live_xxxxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

Regras:

- a empresa é a da chave — não existe parâmetro de empresa;
- chave revogada, expirada ou de empresa suspensa → `401`/`403`;
- o plano precisa incluir o módulo **API de integração**;
- limite de 60 requisições por minuto por IP (`429` acima disso);
- cada chamada é registrada na trilha de auditoria da empresa (`actorType = INTEGRATION`).

### Escopos

| Escopo | Libera |
|---|---|
| `vehicles:read` | `GET /integration/vehicles` |
| `availability:read` | `GET /integration/availability` |
| `reservations:read` | `GET /integration/reservations` |

### Endpoints (somente leitura)

`GET /integration/vehicles?page&pageSize&branchId&categoryId` — frota não vendida,
**sem valores patrimoniais**.

```json
{ "items": [{ "id": "…", "internalCode": "V-001", "plate": "ABC1D23", "make": "Fiat", "model": "Cronos",
  "version": null, "category": "Sedã", "yearManufacture": 2024, "yearModel": 2025, "color": "Prata",
  "fuel": "FLEX", "transmission": "MANUAL", "odometerKm": 12000, "branchId": "…",
  "commercialStatus": "AVAILABLE", "operationalStatus": "RELEASED" }], "total": 1, "page": 1, "pageSize": 25 }
```

`GET /integration/availability?startAt&endAt&branchId&categoryId` — unidades livres no
período (mesma regra da agenda: reservas, contratos, manutenção, bloqueios e tempo de preparo).

`GET /integration/reservations?status&branchId&startAt&endAt&page&pageSize` — reservas com
código, situação, período, categoria, placa e **apenas o nome** do cliente.

Erros seguem o formato único da API:

```json
{ "statusCode": 403, "code": "forbidden", "message": "A chave não tem o escopo reservations:read.", "requestId": "…" }
```

## Webhooks de saída

Cadastre em **Administração › Integrações › Webhooks** a URL (HTTPS em produção; endereços
internos são recusados) e os eventos (`*` para todos, ou tipos como `contract.expiring`). O
segredo `whsec_…` aparece uma única vez e fica cifrado no servidor.

Cada entrega é um `POST` com corpo JSON e os cabeçalhos:

| Cabeçalho | Conteúdo |
|---|---|
| `X-NortyCar-Event` | tipo do evento |
| `X-NortyCar-Delivery` | id único da entrega (use para descartar repetições) |
| `X-NortyCar-Signature` | `sha256=<HMAC-SHA256 do corpo bruto com o segredo, em hex>` |

Validação do lado de quem recebe (Node.js):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
const expected = 'sha256=' + createHmac('sha256', SEGREDO).update(corpoBruto).digest('hex');
const ok = expected.length === assinatura.length && timingSafeEqual(Buffer.from(expected), Buffer.from(assinatura));
```

Responda `2xx` em até 10 s. Falhas são retentadas com espera crescente (até 5 tentativas). O
botão **Testar** faz uma entrega real do evento `test` e registra o código HTTP recebido —
falha de rede aparece como falha.

## Webhooks de entrada (provedor de pagamento)

Em **Integrações › Provedores**, cadastre o nome do provedor (ex.: `asaas`) e o segredo com que
ele assina os webhooks. A tela mostra a URL a configurar no provedor:

```
POST /v1/webhooks/payments/<provedor>
```

Sem provedor cadastrado a rota responde `503 not_configured`. A integração só passa a
"verificada" quando um evento assinado real for aceito. Nenhuma cobrança Pix/boleto/cartão é
gerada pelo Norty Car sem um provedor contratado.

## Rotas públicas do site (sem autenticação)

| Rota | Uso |
|---|---|
| `GET /public/sites/resolve?host=` | domínio → slug (domínio ativo/verificado ou `<slug>.<SITE_BASE_DOMAIN>`) |
| `GET /public/sites/:slug` | identidade, filiais visíveis, categorias com tarifas públicas, adicionais |
| `GET /public/sites/:slug/models?startAt&endAt&categoryId&branchId` | catálogo com disponibilidade por modelo e cor (sem placas) |
| `GET /public/sites/:slug/models/:id` | detalhe do modelo, fotos, arquivo 3D, pontos de interesse |
| `POST /public/sites/:slug/quote` | cotação calculada no servidor com tarifas públicas |
| `POST /public/sites/:slug/leads` | pedido (orçamento, contato, mensal, reserva) com consentimento LGPD obrigatório |
| `GET /public/sites/:slug/files/:id` | fotos de catálogo e marca |
| `GET /public/sites/:slug/share[/models/:id]` | HTML com metatags Open Graph para redes sociais |
| `GET /public/domains/tls-ask?domain=` | autorização do `on_demand_tls` do Caddy: 200 só para domínio ativo |

Site despublicado ou empresa suspensa → `404`, sem detalhar o motivo.
