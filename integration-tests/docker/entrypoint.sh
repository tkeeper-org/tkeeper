#!/bin/sh
set -eu

KEEPER_CONFIG_LOCATION="${KEEPER_CONFIG_LOCATION:-/etc/tkeeper}"
KEEPER_DEV_CONFIG_LOCATION="${KEEPER_DEV_CONFIG_LOCATION:-/etc/tkeeper}"
KEEPER_DEV_ENABLED="${KEEPER_DEV_ENABLED:-true}"

JAVA_LIBRARY_PATH="${JAVA_LIBRARY_PATH:-/usr/local/lib:/usr/lib64:/lib64:/lib:/usr/lib}"
JNA_LIBRARY_PATH="${JNA_LIBRARY_PATH:-/usr/local/lib}"

HSM_ENABLED="${HSM_ENABLED:-false}"

set -- java \
  "-Dkeeper.config.location=${KEEPER_CONFIG_LOCATION}" \
  "-Djava.library.path=${JAVA_LIBRARY_PATH}" \
  "-Djna.library.path=${JNA_LIBRARY_PATH}"

if [ "${KEEPER_DEV_ENABLED}" = "true" ]; then
  set -- "$@" \
    "-Dkeeper.dev.enabled=true" \
    "-Dkeeper.dev.config.location=${KEEPER_DEV_CONFIG_LOCATION}"
fi

if [ -n "${JAVA_OPTS:-}" ]; then
  set -- "$@" "${JAVA_OPTS}"
fi

set -- "$@" -jar /opt/tkeeper/app/tkeeper.jar

if [ "${HSM_ENABLED}" = "true" ]; then
  /opt/tkeeper/init-hsm.sh
fi

exec "$@"