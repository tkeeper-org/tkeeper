FROM registry.access.redhat.com/ubi9/openjdk-25:1.24

ARG TKEEPER_VERSION=dev

LABEL maintainer="TKeeper Labs" \
      app.name="tkeeper" \
      org.opencontainers.image.title="tkeeper" \
      org.opencontainers.image.version="${TKEEPER_VERSION}"

ENV GC_CONTAINER_OPTIONS="-XX:+UseZGC"
ENV JAVA_MAX_MEM_RATIO="75"

ENV JAVA_OPTS_APPEND="\
  -XX:+ExitOnOutOfMemoryError \
  -Dcom.sun.management.jmxremote=false \
  -Djdk.serialFilter=!* \
  -Djdk.tls.client.protocols=TLSv1.3,TLSv1.2 \
  -XX:+UseCompactObjectHeaders \
  --enable-native-access=ALL-UNNAMED"

COPY --chown=185:0 build/docker/tkeeper.jar /deployments/tkeeper.jar

ENV JAVA_APP_JAR="/deployments/tkeeper.jar"

EXPOSE 8080 9090
