# For PKI

An X.509 authority governs a CA key's signature over a DER-encoded `TBSCertificate`. The CA service builds the certificate; TKeeper checks its parsed fields and signs only after policy and any required approvals pass.

```sh
./gradlew shadowJar -Pkeeper.features=authority-x509 -Pkeeper.platforms=ecc
```

## Example: service leaf certificate

This authority accepts a server certificate for `api.svc.test`, with no CA privilege:

```yaml
schemaVersion: verdict.authority/v1
id: test:x509/service-leaf
type: x509.tbs-certificate
version: 1.0.0
config: {}
policy:
  id: test-x509-service-leaf
  fallback: DENY
  allow:
    - id: allow-service-leaf
      where:
        - "version == 3"
        - "subject.commonName == 'api.svc.test'"
        - "extensions.basicConstraints.present"
        - "!extensions.basicConstraints.cA"
        - "extensions.keyUsage.digitalSignature"
        - "extensions.extKeyUsage.serverAuth"
```

The [integration fixture](../../integration-tests/src/testFixtures/resources/authorities/x509/service-leaf.yaml) uses this rule. The [X.509 authority guide](../signing-and-authorities/x509.md#authority-example-workload-server-certificate) adds issuer, DNS SAN, validity, signature algorithm, and operator approval checks for a stricter profile.

The CA service submits exactly the TBS bytes it will publish:

```java
var tbs = new TBSDerEncoded(Base64.getEncoder().encodeToString(tbsDer));
var command = Command.of("test:x509/service-leaf", tbs);
var signature = client.signature().sign(Sign.of(issuingKeyId, command));
byte[] signatureBytes = Base64.getDecoder().decode(signature.signature64());
```

The CA service assembles the final certificate and checks that its signature algorithm matches the key. Enrollment authorization, proof of possession, serial-number uniqueness, revocation, and publication remain in the PKI. Relying parties validate the finished certificate and chain.
