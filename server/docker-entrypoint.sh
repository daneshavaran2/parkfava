#!/bin/sh
# Container entrypoint. Starts as root only to hand the uploads folder to the
# app's user, then runs the app as `node` (uid 1000) with no way to regain
# privileges.
#
# Why: images before this one ran as root, so the files and folders they wrote
# on the persistent uploads disk belong to root, and a mounted disk cannot be
# re-owned from the image. Without this, the app (running as uid 1000) could
# not write new uploads into existing company folders.
#
# Symbolic links are never followed (-P, -xdev, chown -h), so nothing outside
# the uploads folder can be re-owned through it. If the platform already
# starts the container as a non-root user, this only starts the app.
set -eu

UPLOADS="${UPLOAD_DIR:-/app/data/uploads}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOADS"
  find -P "$UPLOADS" -xdev \( ! -user node -o ! -group node \) -exec chown -h node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups --no-new-privs -- "$@"
fi

exec "$@"
