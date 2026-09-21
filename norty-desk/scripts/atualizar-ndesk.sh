#!/usr/bin/env bash
# Atualiza o Norty Desk que já roda na máquina NDesk.
#
#   bash scripts/atualizar-ndesk.sh              # ramo padrão
#   RAMO=outro-ramo bash scripts/atualizar-ndesk.sh
#
# Rode DENTRO da NDesk. Do thor:
#   pct exec <ID> -- bash -lc 'cd /opt/norty-desk && bash scripts/atualizar-ndesk.sh'
#
# Por que não é `git pull`: o provisionamento clona em /tmp e **move**
# a pasta `norty-desk/` do monorepo para /opt/norty-desk, deixando o
# `.git` para trás. Não há repositório ali para puxar. Então a
# atualização é: clonar de novo, trocar a árvore de lugar e devolver os
# arquivos que são desta instalação e de mais nenhuma.
set -euo pipefail

REPO="${REPO:-https://github.com/yurigoes/Norty-Nexor.git}"
RAMO="${RAMO:-claude/brave-turing-b299vy}"
RAIZ="${RAIZ:-/opt/norty-desk}"

titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
falhar() { printf '\n\033[31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

# Os arquivos que nascem nesta máquina e não estão no repositório.
# CHANNEL_SECRET_KEY é o mais sério: ele cifra senha de canal, chave de
# licença e senha de acesso remoto que já estão no banco. Perdê-lo não
# é reconfigurar — é tornar esse conteúdo ilegível para sempre.
PROPRIOS=(infra/.env apps/api/.env)

titulo "Onde estou"
[ -d "$RAIZ" ] || falhar "não achei $RAIZ. Esta máquina é a NDesk?"
command -v docker >/dev/null || falhar "docker não está instalado aqui."
command -v git >/dev/null || falhar "git não está instalado aqui: apt-get install -y git"
echo "  raiz: $RAIZ"
echo "  ramo: $RAMO"

titulo "Guardando o que é desta instalação"
GUARDA="$(mktemp -d)"
trap 'rm -rf "$GUARDA"' EXIT
for arq in "${PROPRIOS[@]}"; do
  [ -f "$RAIZ/$arq" ] || falhar "falta $RAIZ/$arq — esta instalação não está completa, não vou seguir."
  mkdir -p "$GUARDA/$(dirname "$arq")"
  cp "$RAIZ/$arq" "$GUARDA/$arq"
  echo "  guardado: $arq"
done

titulo "Baixando a versão nova"
NOVO="$(mktemp -d)"
trap 'rm -rf "$GUARDA" "$NOVO"' EXIT
git clone -q --depth 1 -b "$RAMO" "$REPO" "$NOVO/repo" \
  || falhar "não consegui clonar $REPO no ramo $RAMO."
[ -d "$NOVO/repo/norty-desk" ] || falhar "o clone não trouxe a pasta norty-desk/."
echo "  commit: $(git -C "$NOVO/repo" log --oneline -1)"

titulo "Trocando a árvore"
# A anterior vira .anterior em vez de sumir: se a build nova não subir,
# há para onde voltar sem depender da rede.
rm -rf "$RAIZ.anterior"
mv "$RAIZ" "$RAIZ.anterior"
mv "$NOVO/repo/norty-desk" "$RAIZ"
for arq in "${PROPRIOS[@]}"; do
  mkdir -p "$RAIZ/$(dirname "$arq")"
  cp "$GUARDA/$arq" "$RAIZ/$arq"
  echo "  devolvido: $arq"
done
echo "  a anterior ficou em $RAIZ.anterior"

titulo "Construindo e subindo"
# `subir-ndesk.sh` é idempotente e já faz a ordem certa: constrói,
# migra com a imagem nova e só então sobe a API.
cd "$RAIZ"
bash scripts/subir-ndesk.sh

cat <<FINAL

Atualizado.

  https://chamados.norty.com.br

Se algo quebrou, a versão anterior inteira está em $RAIZ.anterior:
  rm -rf $RAIZ && mv $RAIZ.anterior $RAIZ && cd $RAIZ && bash scripts/subir-ndesk.sh

Quando estiver satisfeito, apague a cópia:
  rm -rf $RAIZ.anterior
FINAL
