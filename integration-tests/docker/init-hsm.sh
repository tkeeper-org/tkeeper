#!/usr/bin/env bash
set -euo pipefail

MODULE="/usr/local/lib/softhsm/libsofthsm2.so"
TOKEN_LABEL="tkeeper-test"
SO_PIN="softhsm-so"
USER_PIN="softhsm-user"
KEY_LABEL="tkeeper-kek"
KEY_ID="01"
TOKENS_DIR="/var/lib/softhsm/tokens"
MARKER="${TOKENS_DIR}/.initialized"

if [ -f "$MARKER" ]; then
  echo "[init-hsm] Token already initialized, skipping"
  exit 0
fi

echo "[init-hsm] Initializing SoftHSM2 token..."
/usr/local/bin/softhsm2-util --init-token \
  --slot 0 \
  --label "$TOKEN_LABEL" \
  --so-pin "$SO_PIN" \
  --pin "$USER_PIN"

echo "[init-hsm] Generating AES-256 KEK..."
/usr/bin/pkcs11-tool \
  --module "$MODULE" \
  --login --pin "$USER_PIN" \
  --token-label "$TOKEN_LABEL" \
  --keygen \
  --key-type aes:32 \
  --label "$KEY_LABEL" \
  --id "$KEY_ID" \
  --sensitive \
  --extractable

touch "$MARKER"
echo "[init-hsm] Done"