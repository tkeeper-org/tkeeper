FROM eclipse-temurin:21-jdk-jammy AS native-build

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git wget xz-utils \
    build-essential autoconf automake libtool pkg-config m4 \
    libssl-dev opensc \
 && rm -rf /var/lib/apt/lists/*

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
 && ./configure --enable-experimental \
                --enable-module-extrakeys \
                --enable-module-schnorrsig \
                --enable-module-recovery \
                --enable-shared \
                --disable-static \
 && make -j"$(nproc)" \
 && make install

RUN wget -O gmp.tar.xz https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz \
 && tar -xf gmp.tar.xz \
 && cd gmp-6.3.0 \
 && ./configure --enable-shared --disable-static --enable-fat \
 && make -j"$(nproc)" \
 && make install

RUN git clone https://github.com/softhsm/SoftHSMv2.git \
 && cd SoftHSMv2 \
 && git checkout 13e6e86 \
 && ./autogen.sh \
 && ./configure --disable-gost --with-crypto-backend=openssl \
 && make -j"$(nproc)" \
 && make install

RUN ldconfig


FROM eclipse-temurin:21-jdk-jammy AS runtime

USER 0
RUN apt-get update && apt-get install -y --no-install-recommends \
    opensc \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/tkeeper/app /etc/tkeeper /var/lib/tkeeper /var/lib/softhsm/tokens \
 && chown -R 185:0 /opt/tkeeper /etc/tkeeper /var/lib/tkeeper /var/lib/softhsm \
 && chmod -R g+rwX /opt/tkeeper /etc/tkeeper /var/lib/tkeeper /var/lib/softhsm

COPY --from=native-build /usr/local/lib/ /usr/local/lib/
COPY --from=native-build /usr/local/bin/softhsm2-util /usr/local/bin/softhsm2-util

RUN mkdir -p /etc/softhsm2 /var/lib/softhsm/tokens && \
    printf 'directories.tokendir = /var/lib/softhsm/tokens\nobjectstore.backend = file\nlog.level = INFO\nslots.removable = false\n' \
    > /etc/softhsm2/softhsm2.conf
RUN ldconfig

COPY --chown=185:0 build/docker/tkeeper.jar /opt/tkeeper/app/tkeeper.jar
COPY --chown=185:0 integration-tests/docker/entrypoint.sh /opt/tkeeper/entrypoint.sh
COPY --chown=185:0 integration-tests/docker/init-hsm.sh /opt/tkeeper/init-hsm.sh

RUN chmod +x /opt/tkeeper/init-hsm.sh
RUN chmod +x /opt/tkeeper/entrypoint.sh

USER 185
WORKDIR /var/lib/tkeeper

EXPOSE 8080 9090

ENV KEEPER_CONFIG_LOCATION=/etc/tkeeper

ENV JAVA_TOOL_OPTIONS="\
-XX:+UseZGC \
-XX:+ZGenerational \
-XX:MaxRAMPercentage=65.0 \
-XX:+ExitOnOutOfMemoryError \
-Dcom.sun.management.jmxremote=false \
-Djdk.serialFilter=!* \
-Djdk.tls.client.protocols=TLSv1.3,TLSv1.2"

ENTRYPOINT ["/opt/tkeeper/entrypoint.sh"]