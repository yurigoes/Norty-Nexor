#!/bin/sh
# Roda uma vez, quando o volume do banco nasce. O papel da aplicação não é
# superusuário nem tem BYPASSRLS: o isolamento entre empresas depende disso.
set -e
psql -v ON_ERROR_STOP=1 -U postgres <<SQL
CREATE ROLE nortycar LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE nortycar OWNER nortycar;
SQL
psql -v ON_ERROR_STOP=1 -U postgres -d nortycar -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'
