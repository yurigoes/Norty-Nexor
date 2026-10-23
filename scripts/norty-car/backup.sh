#!/usr/bin/env bash
#
# Norty Car — backup do banco e dos arquivos (fotos, documentos, 3D).
#
#   ./scripts/norty-car/backup.sh [pasta-destino]
#
# Gera nortycar-<data>.dump (pg_dump formato custom, restaura com
# pg_restore) e nortycar-storage-<data>.tar.gz. Os dois são necessários:
# o banco sem os arquivos perde as evidências das vistorias, os arquivos
# sem o banco perdem o vínculo com quem os enviou.
# Restauração e rotina recomendada: infra/norty-car/DEPLOY.md.

set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$RAIZ/infra/norty-car/.env"
DESTINO="${1:-$RAIZ/backups}"
DATA="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DESTINO"
set -a; source "$ENV_FILE"; set +a

echo "Banco → $DESTINO/nortycar-$DATA.dump"
docker run --rm --network host -e PGPASSWORD="$POSTGRES_PASSWORD" -v "$DESTINO:/out" postgres:16-alpine \
  pg_dump -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/out/nortycar-$DATA.dump"

echo "Arquivos → $DESTINO/nortycar-storage-$DATA.tar.gz"
docker run --rm -v nortycar_nortycar-storage:/data:ro -v "$DESTINO:/out" alpine \
  tar czf "/out/nortycar-storage-$DATA.tar.gz" -C /data .

# Retenção: 14 cópias locais. A cópia fora do servidor é obrigatória
# (ver DEPLOY.md) — backup que mora no mesmo disco não é backup.
ls -1t "$DESTINO"/nortycar-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DESTINO"/nortycar-storage-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Backup concluído."
