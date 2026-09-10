#!/usr/bin/env bash
# Cria a máquina NDesk no thor e deixa o Norty Desk no ar em
# chamados.norty.com.br.
#
#   TIPO=lxc bash provisionar-ndesk.sh     # container (como o resto do parque)
#   TIPO=vm  bash provisionar-ndesk.sh     # máquina virtual de verdade
#
# NÃO TOCA em nada que já existe: escolhe um ID livre, e recusa se o
# nome NDesk já estiver em uso. O heimdall não é tocado em hipótese
# alguma — ele é a retaguarda.
set -euo pipefail

TIPO="${TIPO:-lxc}"
NOME="${NOME:-NDesk}"
MEM="${MEM:-4096}"
DISCO="${DISCO:-20}"
NUCLEOS="${NUCLEOS:-2}"
PONTE="${PONTE:-vmbr0}"
ARMAZEM="${ARMAZEM:-local-lvm}"
REPO="${REPO:-https://github.com/yurigoes/Norty-Nexor.git}"
RAMO="${RAMO:-claude/brave-turing-b299vy}"

titulo() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
falhar() { printf '\n\033[31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }
aviso()  { printf '\033[33maviso:\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------
titulo "Onde estou"
command -v pveversion >/dev/null || falhar "isto não é um host Proxmox. Rode no thor."
hostname
pveversion | head -1

# O nome pode já existir de uma tentativa anterior. Recriar por cima
# apagaria a máquina de alguém: melhor parar e deixar a decisão com quem
# está na frente do terminal.
titulo "O nome $NOME já está em uso?"
em_uso=$( { pct list 2>/dev/null | awk 'NR>1{print $1" "$3}'; \
            qm list 2>/dev/null | awk 'NR>1{print $1" "$2}'; } | grep -iw "$NOME" || true)
[ -n "$em_uso" ] && falhar "já existe algo chamado $NOME: $em_uso — apague ou escolha outro NOME."
echo "  livre"

# ---------------------------------------------------------------------
titulo "Escolhendo um ID livre"
# Varre os dois espaços de uma vez: no Proxmox, CT e VM compartilham a
# numeração, e reusar um número ocupado é sobrescrever máquina alheia.
usados=$( { pct list 2>/dev/null | awk 'NR>1{print $1}'; \
            qm list 2>/dev/null | awk 'NR>1{print $1}'; } | sort -n | uniq)
ID=""
for n in $(seq 120 199); do
  echo "$usados" | grep -qx "$n" || { ID=$n; break; }
done
[ -z "$ID" ] && falhar "não achei ID livre entre 120 e 199."
echo "  usará o ID $ID  (ocupados: $(echo $usados | tr '\n' ' '))"

# ---------------------------------------------------------------------
# "Segue o padrão da casa" não é força de expressão: Docker dentro de
# LXC depende de `nesting`, e em container não privilegiado ainda
# depende do armazenamento aceitar overlay2. Em vez de escolher no
# escuro, copia-se a configuração de um container que comprovadamente
# roda Docker neste mesmo host.
PRIV="${PRIV:-}"
if [ "$TIPO" = "lxc" ] && [ -z "$PRIV" ]; then
  titulo "Como são os containers que já rodam Docker aqui"
  referencia=""
  for ct in $(pct list 2>/dev/null | awk 'NR>1 && $2=="running"{print $1}'); do
    pct exec "$ct" -- sh -c 'command -v docker >/dev/null 2>&1' 2>/dev/null || continue
    referencia="$ct"; break
  done

  if [ -n "$referencia" ]; then
    unpriv=$(pct config "$referencia" 2>/dev/null | awk -F': ' '/^unprivileged/{print $2}')
    feats=$(pct config "$referencia" 2>/dev/null | awk -F': ' '/^features/{print $2}')
    nome_ref=$(pct config "$referencia" 2>/dev/null | awk -F': ' '/^hostname/{print $2}')
    echo "  referência: CT $referencia ($nome_ref)"
    echo "  unprivileged: ${unpriv:-0}   features: ${feats:-(nenhuma)}"
    PRIV="${unpriv:-0}"
    case "$feats" in
      *nesting*) FEATURES="$feats";;
      *) FEATURES="${feats:+$feats,}nesting=1,keyctl=1"
         aviso "a referência não declara nesting; acrescentando — sem ele o dockerd morre sem dizer o motivo.";;
    esac
  else
    aviso "nenhum container com Docker encontrado para servir de referência."
    PRIV=1; FEATURES="nesting=1,keyctl=1"
  fi
else
  PRIV="${PRIV:-1}"; FEATURES="${FEATURES:-nesting=1,keyctl=1}"
fi

printf '\n\033[1mVai criar %s "%s" com id %s, %s MB, %s núcleos, disco %s GB.\033[0m\n' \
  "$TIPO" "$NOME" "$ID" "$MEM" "$NUCLEOS" "$DISCO"
[ "$TIPO" = "lxc" ] && printf '\033[1munprivileged=%s  features=%s\033[0m\n' "$PRIV" "$FEATURES"
read -rp "Confirma? (digite SIM) " ok
[ "$ok" = "SIM" ] || falhar "cancelado por quem está no terminal."

# ---------------------------------------------------------------------
if [ "$TIPO" = "lxc" ]; then
  titulo "Criando o container"
  MODELO=$(pveam available --section system 2>/dev/null \
    | awk '/debian-12-standard/{print $2}' | sort -V | tail -1)
  [ -z "$MODELO" ] && falhar "não achei modelo debian-12. Rode: pveam update"
  pveam list local 2>/dev/null | grep -q "$MODELO" || { echo "  baixando $MODELO"; pveam download local "$MODELO"; }

  # `nesting=1` é o que permite Docker dentro do container. Sem isso o
  # dockerd sobe e morre, com erro que não diz o motivo.
  pct create "$ID" "local:vztmpl/$MODELO" \
    --hostname "$NOME" --cores "$NUCLEOS" --memory "$MEM" --swap 512 \
    --rootfs "$ARMAZEM:$DISCO" --net0 "name=eth0,bridge=$PONTE,ip=dhcp" \
    --features "$FEATURES" --unprivileged "$PRIV" --onboot 1 --start 1
  echo "  criado; aguardando rede"
  for _ in $(seq 1 30); do pct exec "$ID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break; sleep 2; done
  dentro() { pct exec "$ID" -- bash -lc "$1"; }
else
  titulo "Criando a VM"
  IMG="/var/lib/vz/template/iso/debian-12-genericcloud-amd64.qcow2"
  [ -f "$IMG" ] || { echo "  baixando imagem cloud do Debian 12"; \
    curl -fsSL -o "$IMG" \
      https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2; }
  qm create "$ID" --name "$NOME" --memory "$MEM" --cores "$NUCLEOS" \
    --net0 "virtio,bridge=$PONTE" --scsihw virtio-scsi-pci --ostype l26 --agent 1
  qm importdisk "$ID" "$IMG" "$ARMAZEM" >/dev/null
  qm set "$ID" --scsi0 "$ARMAZEM:vm-$ID-disk-0" --boot order=scsi0 --serial0 socket --vga serial0 >/dev/null
  qm resize "$ID" scsi0 "${DISCO}G" >/dev/null
  # cloud-init: sem isto a VM sobe sem usuário, sem chave e sem rede.
  qm set "$ID" --ide2 "$ARMAZEM:cloudinit" --ipconfig0 ip=dhcp --ciuser root >/dev/null
  [ -f /root/.ssh/id_rsa.pub ] && qm set "$ID" --sshkeys /root/.ssh/id_rsa.pub >/dev/null \
    || aviso "sem /root/.ssh/id_rsa.pub — defina a senha com: qm set $ID --cipassword"
  qm start "$ID"
  falhar "VM criada e iniciada (id $ID). O restante precisa de acesso SSH a ela:
  descubra o IP com  qm guest cmd $ID network-get-interfaces
  e siga o docs/12-provisionar-ndesk.md a partir da seção 4."
fi

# ---------------------------------------------------------------------
titulo "Instalando Docker"
dentro "apt-get update -qq && apt-get install -y -qq ca-certificates curl git >/dev/null"
dentro "install -m0755 -d /etc/apt/keyrings && \
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
  chmod a+r /etc/apt/keyrings/docker.asc"
dentro "echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian bookworm stable' > /etc/apt/sources.list.d/docker.list"
dentro "apt-get update -qq && apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null"
dentro "docker --version && docker compose version"

titulo "Trazendo o código"
dentro "rm -rf /tmp/nd && git clone -q -b '$RAMO' '$REPO' /tmp/nd && \
  rm -rf /opt/norty-desk && mv /tmp/nd/norty-desk /opt/norty-desk && rm -rf /tmp/nd"
dentro "cp -n /opt/norty-desk/infra/.env.exemplo /opt/norty-desk/infra/.env; \
        cp -n /opt/norty-desk/apps/api/.env.example /opt/norty-desk/apps/api/.env; true"

titulo "A infra compartilhada responde daqui?"
dentro "getent hosts 192.168.15.72 >/dev/null; \
  (exec 3<>/dev/tcp/192.168.15.72/5432) 2>/dev/null && echo '  ok Postgres do CT 102' \
  || echo '  NÃO alcança o Postgres do CT 102 (192.168.15.72:5432)'"

cat <<FINAL

$( [ "$TIPO" = lxc ] && echo "Container" || echo "VM" ) $NOME criado com id $ID.

Falta o que é segredo, e por isso não é automático:

  1. TUNNEL_TOKEN em /opt/norty-desk/infra/.env
     (Cloudflare → Zero Trust → Networks → Tunnels → chamados.norty.com.br)
  2. DATABASE_URL e WEB_ORIGIN em /opt/norty-desk/apps/api/.env
     WEB_ORIGIN=https://chamados.norty.com.br

Depois, de dentro:

  pct exec $ID -- bash -lc 'cd /opt/norty-desk && bash scripts/subir-ndesk.sh'

No painel da Cloudflare, o túnel aponta para http://desk-web:80 — nome
de serviço da rede do compose, não IP.

O heimdall não foi tocado: desk.norty.com.br segue de retaguarda.
FINAL
