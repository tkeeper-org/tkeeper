# Linux aarch64 has no bundled Anvil natives, so production images provide the system fallback.
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
ARG TKEEPER_JAR=build/docker/tkeeper.jar
ARG TKEEPER_TARGET=all
ARG TKEEPER_ECC=true

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
  -Djava.library.path=/usr/local/lib:/usr/lib64:/lib64:/usr/lib:/lib \
  -Dmsgpack.universal-buffer=true \
  -XX:+UseCompactObjectHeaders \
  --enable-native-access=ALL-UNNAMED"

COPY --from=native-build /usr/local/lib/libgmp.so* /usr/local/lib/
COPY --from=native-build /usr/local/lib/libsecp256k1.so* /usr/local/lib/
COPY --from=native-build /usr/local/lib/libsodium.so* /usr/local/lib/
COPY --chown=185:0 ${TKEEPER_JAR} /deployments/tkeeper.jar
COPY --chown=185:0 tools/NativeJarSmoke.java /tmp/NativeJarSmoke.java

RUN printf '%s\n' \
      'public class NativeSmoke {' \
      '  public static void main(String[] args) {' \
      '    System.loadLibrary("gmp");' \
      '    System.loadLibrary("secp256k1");' \
      '    System.loadLibrary("sodium");' \
      '  }' \
      '}' \
      > /tmp/NativeSmoke.java \
 && java \
      -Djava.library.path=/usr/local/lib \
      /tmp/NativeSmoke.java \
 && java \
      --enable-native-access=ALL-UNNAMED \
      -Djava.library.path=/usr/local/lib:/usr/lib64:/lib64:/usr/lib:/lib \
      -cp /deployments/tkeeper.jar \
      /tmp/NativeJarSmoke.java "${TKEEPER_TARGET}" "${TKEEPER_ECC}" \
 && rm /tmp/NativeSmoke.java /tmp/NativeJarSmoke.java

ENV JAVA_APP_JAR="/deployments/tkeeper.jar"

EXPOSE 8080 9090
