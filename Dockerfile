# Linux aarch64 needs explicit system-library opt-in; images provide those libraries.
FROM registry.access.redhat.com/ubi9/ubi:9.7 AS native-build

RUN dnf install -y \
      autoconf \
      automake \
      gcc \
      git \
      libtool \
      m4 \
      make \
      pkgconf-pkg-config \
      xz \
 && dnf clean all

WORKDIR /tmp

RUN git clone https://github.com/jedisct1/libsodium.git \
 && cd libsodium \
 && git checkout 9511c982fb1d046470a8b42aa36556cdb7da15de \
 && ./autogen.sh \
 && ./configure --enable-shared --disable-static --disable-minimal --with-pic \
 && make -j"$(nproc)" \
 && make install

RUN git clone https://github.com/bitcoin-core/secp256k1.git \
 && cd secp256k1 \
 && git checkout 0cdc758a56360bf58a851fe91085a327ec97685a \
 && ./autogen.sh \
 && ./configure \
      --enable-experimental \
      --enable-module-extrakeys \
      --enable-module-schnorrsig \
      --enable-module-recovery \
      --enable-shared \
      --disable-static \
 && make -j"$(nproc)" \
 && make install

COPY vendor/gmp/gmp-6.3.0.tar.xz vendor/gmp/SHA256SUMS ./

RUN sha256sum --check --strict SHA256SUMS \
 && tar -xf gmp-6.3.0.tar.xz \
 && cd gmp-6.3.0 \
 && ./configure --enable-shared --disable-static --enable-fat \
 && make -j"$(nproc)" \
 && make install

FROM registry.access.redhat.com/ubi9/openjdk-25:1.24

ARG TKEEPER_VERSION=dev
ARG TKEEPER_JAR=build/docker/production/tkeeper.jar
ARG TKEEPER_PROFILE=production
ARG TKEEPER_JAR_SHA256
ARG TKEEPER_TARGET=all
ARG TKEEPER_ALLOW_SYSTEM_LIBRARIES=false
ARG TARGETOS
ARG TARGETARCH

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
  -Dmsgpack.universal-buffer=true \
  -XX:+UseCompactObjectHeaders"

USER 0

COPY --from=native-build /usr/local/lib/libgmp.so* /usr/local/lib/
COPY --from=native-build /usr/local/lib/libsecp256k1.so* /usr/local/lib/
COPY --from=native-build /usr/local/lib/libsodium.so* /usr/local/lib/
COPY --chown=0:0 ${TKEEPER_JAR} /deployments/tkeeper.jar
COPY --chown=185:0 tools/verify-docker-jar.sh /tmp/verify-docker-jar.sh

RUN case "${TKEEPER_PROFILE}" in production|production-test) ;; *) echo "Unsupported production Docker profile" >&2; exit 1 ;; esac \
 && sh /tmp/verify-docker-jar.sh /deployments/tkeeper.jar "${TKEEPER_PROFILE}" "${TKEEPER_JAR_SHA256}" \
 && rm /tmp/verify-docker-jar.sh

COPY --chown=185:0 tools/NativeJarSmoke.java /tmp/NativeJarSmoke.java
COPY tools/DockerNativeModule.java /tmp/DockerNativeModule.java
COPY --chown=185:0 tools/native-library-options.sh /tmp/native-library-options.sh
COPY tools/production-java.options /deployments/production-java.options
COPY tools/production-entrypoint.sh /usr/local/bin/tkeeper-run

RUN sh /tmp/native-library-options.sh "${TKEEPER_ALLOW_SYSTEM_LIBRARIES}" "${TARGETOS}/${TARGETARCH}" \
      > /deployments/native-library.options \
 && printf '%s\n' '-Djava.library.path=/usr/local/lib:/usr/lib64:/lib64:/usr/lib:/lib' \
      >> /deployments/native-library.options \
 && java /tmp/DockerNativeModule.java /deployments/tkeeper.jar /deployments/tkeeper-native.jar \
 && java \
      @/deployments/production-java.options \
      @/deployments/native-library.options \
      -cp /deployments/tkeeper.jar \
      /tmp/NativeJarSmoke.java "${TKEEPER_TARGET}" container \
 && chown root:root /deployments \
 && chmod 0755 /deployments \
 && chmod 0555 /usr/local/bin/tkeeper-run \
 && chmod 0444 /deployments/tkeeper.jar /deployments/tkeeper-native.jar /deployments/*.options \
 && rm /tmp/NativeJarSmoke.java /tmp/DockerNativeModule.java /tmp/native-library-options.sh

ENV JAVA_APP_JAR="/deployments/tkeeper.jar"

USER 185

EXPOSE 8080 9090

CMD ["/usr/local/bin/tkeeper-run"]
