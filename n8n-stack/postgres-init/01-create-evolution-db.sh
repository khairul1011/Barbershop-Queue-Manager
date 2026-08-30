#!/bin/bash
# Dijalankan otomatis oleh image postgres HANYA pada inisialisasi pertama
# (saat volume data masih kosong). Database "n8n" sudah dibuat lewat
# POSTGRES_DB, skrip ini menambahkan database kedua untuk Evolution API.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE evolution;
EOSQL
