# Instalação no Proxmox

Guia para subir o my Home num host Proxmox e deixar o Claude Code
trabalhando dentro dele.

---

## A regra que decide tudo

**O Claude Code precisa morar no mesmo contêiner que a aplicação.**

Ele só enxerga o Docker, os logs, o `.env`, o banco e o certificado da
máquina onde está rodando. Instalado num contêiner ocioso qualquer, ele
fica tão cego quanto uma sessão na nuvem — enxerga o repositório, não a
operação. Aí não adianta ter acesso à rede: o que falta não é rede, é
estar no lugar certo.

Então a escolha não é "um contêiner novo ou um que esteja usando pouco",
e sim: **crie um contêiner dedicado ao my Home e instale o Claude Code
dentro dele.**

### Por que não aproveitar um contêiner existente

- **Conflito de portas.** O Caddy precisa da 80 e da 443. Se o contêiner
  já roda qualquer outro serviço web, uma das duas coisas não sobe.
- **Raio de dano.** O banco vai guardar dados reais de moradores. Um
  `docker compose down -v` digitado no diretório errado apaga volume de
  outra coisa junto.
- **Backup e restauração.** Snapshot do Proxmox é por contêiner. Com o
  my Home isolado, você restaura só ele, sem levar o resto junto.

---

## LXC ou VM?

Docker funciona nos dois. A diferença importa mais do que parece:

| | LXC (contêiner) | VM |
|---|---|---|
| Consumo | ~100 MB de overhead | ~500 MB a 1 GB |
| Docker | Funciona com `nesting=1` e `keyctl=1` | Caminho oficialmente suportado |
| Isolamento | Cada permissão extra (`keyctl`, `fuse`) devolve ao contêiner uma syscall que o LXC existia para bloquear | Isolamento completo por hardware |
| Armazenamento em ZFS | O `overlay2` do Docker **não** funciona sobre rootfs ZFS em contêiner não privilegiado — precisa de `fuse-overlayfs` | Indiferente |

**Recomendação:** para este sistema, **VM**. Não é purismo — é que o
banco vai guardar CPF, telefone e endereço de moradores reais, e o
caminho para rodar Docker em LXC passa por reabilitar justamente as
proteções que justificam usar LXC. Se o Thor tem RAM sobrando, o custo de
1 GB compra um isolamento que você não precisa justificar depois.

**Use LXC se** a RAM estiver apertada e o armazenamento **não** for ZFS.

Decida em dez segundos, no shell do Proxmox:

```bash
free -h              # RAM livre — precisa de ~5 GB para a VM, ~4 GB para o LXC
pvesm status         # se a coluna Type disser 'zfspool', prefira a VM
```

---

## Caminho A — VM (recomendado)

Pela interface: **Create VM**, ISO do Debian 12 ou Ubuntu Server 24.04.

| Recurso | Valor |
|---|---|
| Cores | 4 |
| Memória | 4096 MB |
| Disco | 32 GB |
| Rede | `vmbr0`, IP fixo |

Depois de instalar o sistema, siga direto para
[Dentro da máquina](#dentro-da-máquina).

---

## Caminho B — LXC

No shell do Proxmox. Ajuste `120`, o IP e o *storage* para os seus:

```bash
pct create 120 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname myhome \
  --cores 4 \
  --memory 4096 \
  --swap 2048 \
  --rootfs local-lvm:32 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.50/24,gw=192.168.1.1 \
  --unprivileged 1 \
  --features nesting=1,keyctl=1,fuse=1 \
  --onboot 1 \
  --start 1
```

`nesting=1` permite rodar contêineres dentro do contêiner; `keyctl=1` é
obrigatório em contêiner não privilegiado, senão o daemon do Docker nem
inicia.

### Se o armazenamento for ZFS

O `overlay2` não monta sobre rootfs ZFS a partir de um namespace
aninhado. Dentro do contêiner:

```bash
apt install -y fuse-overlayfs
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{ "storage-driver": "fuse-overlayfs" }
JSON
systemctl restart docker
```

---

## Dentro da máquina

Vale para os dois caminhos. Como `root`:

```bash
# 1. Sistema em dia e utilitários que o diagnóstico usa
apt update && apt upgrade -y
apt install -y curl git ca-certificates dnsutils iproute2

# 2. Docker
curl -fsSL https://get.docker.com | sh

# 3. Usuário de trabalho — não opere no root por hábito
adduser --gecos "" norty
usermod -aG docker,sudo norty
```

Agora como `norty`:

```bash
su - norty

# 4. Node 22 (o Claude Code precisa dele)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 5. Claude Code
curl -fsSL https://claude.ai/install.sh | bash

# 6. O projeto
git clone <URL-DO-REPOSITORIO> my-home && cd my-home
cp infra/.env.example infra/.env
nano infra/.env          # preencha ACME_EMAIL

# 7. Diagnóstico antes de subir
./scripts/preflight.sh
```

Corrija o que o diagnóstico apontar e então:

```bash
./scripts/bootstrap.sh --demo
```

A partir daí, `claude` dentro de `~/my-home` abre uma sessão que enxerga
a máquina inteira: contêineres, logs, banco e certificado.

---

## Rede

Três coisas precisam bater, e é aqui que a maioria dos deploys trava:

1. **IP fixo.** O redirecionamento do roteador aponta para um IP. Se ele
   mudar por DHCP, o site cai sem ninguém ter mexido em nada. Configure
   IP estático no contêiner ou reserva por MAC no roteador.

2. **Redirecionamento no roteador.** Portas 80 e 443 da internet para o
   IP desta máquina. O Let's Encrypt valida alcançando o servidor de
   fora — sem isso, o certificado não é emitido.

3. **DNS.** Dois registros A no `norty.com.br` apontando para o seu IP
   público:

   ```
   myhome       A    <IP público>
   api-myhome   A    <IP público>
   ```

### Se você já tem um proxy reverso na rede

Comum em homelab: um Nginx Proxy Manager ou Traefik já ocupando 80 e 443.
Nesse caso **não suba o Caddy** — deixe o proxy existente encaminhar:

```
myhome.norty.com.br      →  <IP da máquina>:8080
api-myhome.norty.com.br  →  <IP da máquina>:8081
```

E no `infra/docker-compose.yml`, remova o serviço `caddy` e publique as
portas dos serviços `web` e `api` (`8080:80` e `8081:3333`). O TLS passa
a ser responsabilidade do proxy que já existe.

---

## Antes do primeiro deploy

Tire um snapshot. Custa dez segundos e transforma qualquer erro em um
`rollback`:

```bash
# no shell do Proxmox
pct snapshot 120 antes-do-myhome     # LXC
qm  snapshot 120 antes-do-myhome     # VM
```

E configure o backup do Proxmox para incluir esta máquina assim que o
sistema estiver no ar com dados reais.
