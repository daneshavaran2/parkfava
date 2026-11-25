#!/usr/bin/env bash
# Backup and restore drill (docs/security/PRODUCTION_SECURITY_CHECKLIST.md).
#
# Backs up a database and its uploads folder, restores both into an EMPTY
# database and an EMPTY folder, and checks that nothing was lost: backup
# checksums, row counts of every table, every uploaded file byte for byte,
# and the applied migrations.
#
#   SOURCE_DATABASE_URL=postgres://…/fava   SOURCE_UPLOAD_DIR=/data/uploads \
#   RESTORE_DATABASE_URL=postgres://…/fava_restore   RESTORE_UPLOAD_DIR=/tmp/uploads-restore \
#   BACKUP_DIR=/secure/backups/2026-11-25   bash scripts/backup-restore-drill.sh
#
# Optional: RESTORE_UPLOAD_OWNER=1000:1000 (the container runs as uid 1000).
#
# The backup contains password hashes, session hashes and the encrypted
# assistant API key: keep it encrypted and access-controlled. That key can
# only be decrypted with the same SETTINGS_ENCRYPTION_KEY (or, while that is
# unset, the same DATABASE_URL), so record the key in the recovery
# instructions, never inside the backup. Row counts of a database that is
# being written to during the backup can differ by the rows written meanwhile.
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL}"
: "${SOURCE_UPLOAD_DIR:?set SOURCE_UPLOAD_DIR}"
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL (an empty database)}"
: "${RESTORE_UPLOAD_DIR:?set RESTORE_UPLOAD_DIR (an empty or missing folder)}"
: "${BACKUP_DIR:?set BACKUP_DIR}"

[ "$SOURCE_DATABASE_URL" != "$RESTORE_DATABASE_URL" ] || die "restore database is the source database"
[ -d "$SOURCE_UPLOAD_DIR" ] || die "SOURCE_UPLOAD_DIR does not exist"
existing=$(psql -qtA "$RESTORE_DATABASE_URL" -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
[ "$existing" = "0" ] || die "restore database is not empty ($existing tables); refusing to touch it"
if [ -e "$RESTORE_UPLOAD_DIR" ] && [ -n "$(ls -A "$RESTORE_UPLOAD_DIR")" ]; then
  die "RESTORE_UPLOAD_DIR is not empty"
fi

row_counts() {
  psql -qtA "$1" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1" |
    while read -r table; do
      echo "$table $(psql -qtA "$1" -c "SELECT count(*) FROM \"$table\"")"
    done
}
file_sums() { (cd "$1" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum); }

umask 077
mkdir -p "$BACKUP_DIR"

echo "== backup"
row_counts "$SOURCE_DATABASE_URL" > "$BACKUP_DIR/row-counts.txt"
file_sums "$SOURCE_UPLOAD_DIR" > "$BACKUP_DIR/upload-sums.txt"
pg_dump --format=custom --no-owner --no-privileges --file "$BACKUP_DIR/database.dump" "$SOURCE_DATABASE_URL"
tar -C "$SOURCE_UPLOAD_DIR" -czf "$BACKUP_DIR/uploads.tar.gz" .
(cd "$BACKUP_DIR" && sha256sum database.dump uploads.tar.gz row-counts.txt upload-sums.txt > SHA256SUMS)
echo "   $(wc -l < "$BACKUP_DIR/row-counts.txt") tables, $(wc -l < "$BACKUP_DIR/upload-sums.txt") files," \
  "$(du -sh "$BACKUP_DIR" | cut -f1) in $BACKUP_DIR"

echo "== restore"
(cd "$BACKUP_DIR" && sha256sum --quiet -c SHA256SUMS) || die "backup checksums do not match"
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DATABASE_URL" "$BACKUP_DIR/database.dump"
mkdir -p "$RESTORE_UPLOAD_DIR"
tar -C "$RESTORE_UPLOAD_DIR" --no-same-owner -xzf "$BACKUP_DIR/uploads.tar.gz"
if [ -n "${RESTORE_UPLOAD_OWNER:-}" ]; then chown -R "$RESTORE_UPLOAD_OWNER" "$RESTORE_UPLOAD_DIR"; fi

echo "== verify"
failed=0
if diff <(row_counts "$RESTORE_DATABASE_URL") "$BACKUP_DIR/row-counts.txt" > /dev/null; then
  echo "   ok   row counts of all $(wc -l < "$BACKUP_DIR/row-counts.txt") tables match"
else
  echo "   FAIL row counts differ:"; diff <(row_counts "$RESTORE_DATABASE_URL") "$BACKUP_DIR/row-counts.txt" || true
  failed=1
fi
if diff <(file_sums "$RESTORE_UPLOAD_DIR") "$BACKUP_DIR/upload-sums.txt" > /dev/null; then
  echo "   ok   all $(wc -l < "$BACKUP_DIR/upload-sums.txt") uploaded files are byte-identical"
else
  echo "   FAIL uploaded files differ"; failed=1
fi
src_mig=$(psql -qtA "$SOURCE_DATABASE_URL" -c "SELECT max(name) FROM _migrations")
dst_mig=$(psql -qtA "$RESTORE_DATABASE_URL" -c "SELECT max(name) FROM _migrations")
if [ "$src_mig" = "$dst_mig" ]; then
  echo "   ok   migrations restored up to $dst_mig"
else
  echo "   FAIL migrations: source $src_mig, restored $dst_mig"; failed=1
fi
[ "$failed" = 0 ] && echo "restore verified" || { echo "restore NOT verified"; exit 1; }
