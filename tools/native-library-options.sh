#!/bin/sh
set -eu

allow_system="${1:-false}"

case "$allow_system" in
  auto)
    case "${2:-}" in
      linux/arm64) allow_system=true ;;
      *) allow_system=false ;;
    esac
    ;;
  true|false) ;;
  *)
    echo "Expected true, false, or auto for TKEEPER_ALLOW_SYSTEM_LIBRARIES" >&2
    exit 1
    ;;
esac

printf '%s\n' "-Dkeeper.native.allow-system=${allow_system}"
