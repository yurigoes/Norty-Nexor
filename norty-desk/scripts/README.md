# scripts

Coletores para rodar **no host thor**, porque a sessão que gerou este
projeto não alcança o servidor (sem Tailscale, sem cliente SSH, egresso
bloqueado para `*.norty.com.br`). Ver `docs/08-design.md`, seção 0.

Os dois são **somente leitura**: listam, leem e copiam. Não reiniciam
serviço, não escrevem em container, não alteram banco.

## `coletar-licita.sh`

Acha o licita nos containers e extrai a identidade visual: configuração
de tema, variáveis CSS, cores mais usadas, fontes, raios e sombras.

```bash
ssh -i ~/.ssh/norty_cluster_ed25519 root@100.91.185.42
bash coletar-licita.sh

# se o app tem outro nome interno
ALVO=licitai bash coletar-licita.sh

# se está fora da faixa 100-107
CTS='108 109' bash coletar-licita.sh
```

Sai em `/tmp/licita-design-<data>.tar.gz`.

Com isso eu realinho `apps/web/src/styles/tokens.css` — o design está
inteiramente tokenizado justamente para que isso seja troca de valores,
não reescrita de componente.

**Ajuda muito também:** duas capturas de tela, uma da listagem e uma de
uma tela de detalhe. Cor eu tiro do CSS; proporção, densidade e
hierarquia só a imagem mostra.

## `coletar-glpi.sh`

Levanta a base real do GLPI para fechar o plano de migração
(`docs/09-migracao.md`, seção 1): versão, volume por tabela, árvore de
entidades, perfis em uso, SLAs, calendários, plugins e volume por ano.

```bash
CT=105 bash coletar-glpi.sh    # ou sem CT, que ele procura
```

Sai em `/tmp/glpi-inventario-<data>.tar.gz`.

A **árvore de entidades** é a resposta mais importante: se `glpi_entities`
tiver só a raiz e um nível, a migração para `Organization` plana é
direta; se tiver três níveis com `is_recursive` espalhado, é decisão
caso a caso.

## Antes de me enviar

Os dois pacotes podem conter variável de ambiente ou credencial:

```bash
grep -rniE 'senha|password|secret|token|api[_-]?key' /tmp/licita-design-*/
```

Apague o que aparecer. Nada disso é necessário para o realinhamento
visual nem para o plano de migração.
