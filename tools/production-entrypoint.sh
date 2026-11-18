#!/bin/sh
set -eu

native_defaults=@/deployments/native-library.options
security_options=@/deployments/production-java.options

if [ "${JAVA_OPTS+x}" = x ]; then
  export JAVA_OPTS="$native_defaults ${JAVA_OPTS:+$JAVA_OPTS }$security_options"
else
  export JAVA_OPTS_APPEND="$native_defaults ${JAVA_OPTS_APPEND:+$JAVA_OPTS_APPEND }$security_options"
fi

exec /usr/local/s2i/run "$@"
