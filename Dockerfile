FROM registry.access.redhat.com/ubi9/openjdk-21:1.23

LABEL maintainer="TKeeper Labs" \
      app.name="tkeeper"

ENV JAVA_OPTS_APPEND="\
  -XX:+UseZGC \
  -XX:+ZGenerational \
  -XX:MaxRAMPercentage=65.0 \
  -XX:+ExitOnOutOfMemoryError \
  -Dcom.sun.management.jmxremote=false \
  -Djdk.serialFilter=!* \
  -Djdk.tls.client.protocols=TLSv1.3,TLSv1.2"

COPY --chown=185:0 build/docker/tkeeper.jar /deployments/tkeeper.jar

ENV JAVA_APP_JAR="/deployments/tkeeper.jar"

EXPOSE 8080 9090