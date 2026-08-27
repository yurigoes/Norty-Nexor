# Proxmox — notas de referência

> O deploy do my Home está em **[NORTY.md](NORTY.md)**: CT 105 Asgard,
> banco no CT 102 e Cloudflare Tunnel na borda. Este arquivo guarda o que
> vale caso o my Home ganhe um CT próprio no futuro.

## Docker dentro de LXC

Contêiner não privilegiado precisa das duas features, senão o daemon do
Docker nem inicia:

```bash
pct set <CTID> --features nesting=1,keyctl=1
```

`nesting=1` permite contêineres dentro do contêiner; `keyctl=1` libera a
syscall que o Docker usa para gerenciar chaves.

### Armazenamento em ZFS

O `overlay2` não monta sobre rootfs ZFS a partir de um namespace
aninhado. Dentro do CT:

```bash
apt install -y fuse-overlayfs
mkdir -p /etc/docker
echo '{ "storage-driver": "fuse-overlayfs" }' > /etc/docker/daemon.json
systemctl restart docker
```

E adicione `fuse=1` às features do CT.

## Criar um CT novo

```bash
pct create 108 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname norty-myhome \
  --cores 4 --memory 4096 --swap 2048 \
  --rootfs local-lvm:32 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.15.78/24,gw=192.168.15.1 \
  --unprivileged 1 \
  --features nesting=1,keyctl=1,fuse=1 \
  --onboot 1 --start 1

# bind-mount do código, seguindo a convenção da casa
pct set 108 -mp0 /srv/apps-myhome,mp=/opt/myhome
```

Depois, dentro do CT: `curl -fsSL https://get.docker.com | sh`.

## Antes de qualquer deploy

Snapshot custa dez segundos e transforma erro em `rollback`:

```bash
pct snapshot 105 antes-do-myhome
```
