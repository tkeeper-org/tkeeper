# ТЗ: Approvers и WebAuthn для FourEyeControl

Статус: спецификация для реализации, 2026-10-10. Раздел 5 обновлён 2026-10-11 по согласованной архитектуре распределённого реестра. Актуальный реализованный API описан в `docs/api-reference/approvers.md`; этот документ также содержит требования следующих этапов.

## 1. Цель и границы

Реализовать два связанных блока поверх существующего FourEyeControl:

1. **WebAuthn:** регистрация credential и использование WebAuthn assertion как approval proof на уровне ключа и authority policy.
2. **Approvers:** реестр signature/WebAuthn approvers с метадатой и обязательной привязкой ссылок в политиках к digest credential.

Сохраняются существующие m-of-n, режимы STRICT/LENIENT, cumulative enforcement, канонический hash операции, авторизация API, nonce и lifecycle через REFRESH/ROTATE.

Согласованные архитектурные решения:

- Один зарегистрированный credential — один approver. Массив credentials внутри approver не вводится.
- Регистратор отвечает за людей, команды, проверку личности, владение credential и недопущение нескольких голосов одного человека. Keeper не вводит собственную модель пользователей.
- Политика закрепляет конкретную security-версию approver; ссылка без hash недопустима.
- Изменение реестра не подменяет credential в уже действующей политике.
- Замена approver в действующей политике проходит через существующий REFRESH/ROTATE, авторизованный старым доступным quorum.
- Резерв approvers закладывает владелец политики. Emergency path и recovery через seal shares не реализуются.

Форматы, маршруты, лимиты и параметры ниже конкретизируют эти решения для первой версии. Это предлагаемый контракт реализации, а не описание уже существующего API.

## 2. Существующее поведение, которое нужно сохранить

| Источник требования | Где действует |
| --- | --- |
| Ключевой FourEye, STRICT | Sign, Decrypt, ROTATE, REFRESH, Destroy |
| Ключевой FourEye, LENIENT | ROTATE, REFRESH, Destroy |
| Authority policy approvals | Typed signing по matching allow rules или fallback |
| Политика, переданная при CREATE | Начинает действовать после активации первой generation |

Authority policy approvals сейчас не являются отдельным разрешением на REFRESH/ROTATE. Эти lifecycle-операции защищает FourEye текущего ключа, если он задан.

У ключевого FourEye допускаются `1 <= m <= n <= 256` и `keys.size == n`, включая `1 of 1` и `1 of n`. У authority approval group сохраняется `1 <= threshold <= размер группы`, максимум 256 approvers. `m = n` остаётся допустимым, но запаса на потерю credential не даёт.

Все matching authority groups и ключевая группа обязательны одновременно. Один proof может удовлетворять нескольким группам, если соответствующий credential и метод разрешены в каждой из них; внутри одной группы он считается максимум один раз.

Все proofs передаются в одном `approvals.proofs`, с общими `keeperId`, `nonce`, `timestamp`. Добавление proofs не меняет `hashForSigning`.

## 3. Блок Approvers

### 3.1. Модель записи

Запись состоит из трёх частей:

| Часть | Содержимое | Изменяемость |
| --- | --- | --- |
| Идентификация | `id`, вычисленный `ref` | Не меняется для существующей записи |
| Security descriptor | Тип proof, публичный ключ и параметры проверки | Immutable |
| Сопровождение | `metadata`, timestamps, WebAuthn runtime state | Может меняться по правилам ниже |

Пример signature-записи:

```json
{
  "id": "alice",
  "ref": "alice@sha256:<64 lowercase hex characters>",
  "credential": {
    "version": 1,
    "type": "SIGNATURE",
    "algorithm": "ED25519",
    "publicKey64": "..."
  },
  "metadata": {
    "displayName": "Alice",
    "team": "treasury",
    "externalUserId": "employee-123"
  },
  "createdAt": 1791580000000,
  "updatedAt": 1791580000000,
  "metadataRevision": 1
}
```

Пример WebAuthn descriptor:

```json
{
  "version": 1,
  "type": "WEBAUTHN",
  "credentialId": "<base64url>",
  "publicKeyCose": "<base64url canonical public COSE_Key>",
  "rpId": "approvals.example.com",
  "origins": ["https://approvals.example.com"],
  "userVerification": "REQUIRED",
  "userHandle": "<base64url opaque bytes>",
  "backupEligible": false
}
```

Для WebAuthn ключ и credentialId извлекает сервер из успешно проверенной registration response. Клиент не может заменить их отдельными полями finish-запроса. `userHandle` — технический случайный идентификатор для WebAuthn, не идентификатор человека и не основание для выдачи дополнительного голоса.

`id` — стабильное имя для регистратора. Оно может объединять несколько immutable security-версий: `alice@H1` и `alice@H2`. Каждая версия содержит ровно один credential. Никакого автоматического переключения старой ссылки на новую версию нет; `latest` не используется при авторизации.

### 3.2. Метадата

`metadata` имеет тип `Map<String, String>`. Поддержать произвольные строковые пары, в частности `team`, `displayName`, `externalUserId`.

Метадата предназначена для поиска, отображения и фильтров. Она:

- не входит в digest;
- не меняет права или состав approval group;
- не участвует в дедупликации голосов;
- не доказывает, что два credentials принадлежат разным людям;
- не позволяет политике выбирать динамическую группу вроде «все из team=treasury».

Изменение команды или имени не требует REFRESH/ROTATE. В UI значения отображаются как текст, без исполнения HTML.

### 3.3. Ref и hash binding

Единственный новый формат ссылки:

```text
<id>@sha256:<64 lowercase hex characters>
```

В политике он передаётся объектом:

```json
{"ref": "alice@sha256:<64 lowercase hex characters>"}
```

Плейсхолдеры в примерах этого документа не являются валидными refs. Реальный ref возвращает сервер после регистрации. Timestamps также иллюстративны: для реального запроса формируются свежие nonce и timestamp.

Не принимать bare id, короткий checksum, `latest`, mutable version tag, произвольный алгоритм hash или ссылку без digest. Регистр id значим; hex digest — lowercase. `id` ограничить выражением `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; символ `@` внутри id запрещён.

Digest вычисляет Keeper:

```text
descriptorBytes = UTF-8(canonicalJson(normalizedSecurityDescriptor))
digestBytes     = SHA-256(UTF-8("TKEEPER_APPROVER_V1") || 0x00 || descriptorBytes)
ref             = id || "@sha256:" || lowercaseHex(digestBytes)
```

Нормализация обязательна до вычисления digest:

- Для SIGNATURE — каноническое имя algorithm и проверенный публичный ключ, декодированный и заново закодированный соответствующим provider.
- Для WEBAUTHN — проверенный публичный COSE_Key; в первой версии нормализуются обязательные public-поля ES256 (`kty`, `alg`, `crv`, `x`, `y`) с детерминированным CBOR encoding. Приватные параметры не принимаются.
- WebAuthn binary-поля имеют canonical Base64url без padding. Signature `publicKey64` сохраняет существующий Base64-контракт.
- RP ID и origins валидируются и приводятся к единому представлению при регистрации. Origins — непустой, уникальный, отсортированный список точных origins, без wildcard, path, query или fragment.
- JSON object keys сортируются рекурсивно, null-поля исключаются; типы scalar сохраняются. Unknown fields и duplicate object keys в security descriptor отклоняются.

В digest входит весь descriptor: в том числе `version`, `type`, algorithm/COSE parameters, публичный ключ, credentialId, RP ID, origins, UV requirement, ожидаемый userHandle и backup eligibility для WebAuthn.

Не входят `id`, `ref`, metadata, timestamps, transports, AAGUID/диагностическая информация, signCount, текущее backup state и lastUsedAt. Эти исключения не могут использоваться для ослабления проверки assertion.

Если в будущем появляется новый security-параметр, он включается в следующую версию descriptor; его нельзя добавлять как изменяемое поле, которое незаметно меняет смысл старого ref.

При разрешении ссылки Keeper берёт **ожидаемый digest из доверенной политики выбранной generation**, вычисляет digest полученного descriptor и сравнивает их. Digest, присланный рядом с descriptor в proof/реестре, не является самостоятельным основанием доверия.

### 3.4. Неизменяемость и замена credential

Добавление `alice@H2` не перезаписывает и не удаляет `alice@H1`. Разрешается зарегистрировать новую версию с тем же id, после чего старый quorum должен одобрить REFRESH/ROTATE с новой ссылкой в целевой политике.

В первой версии нет API изменения security descriptor существующего ref и нет API его физического удаления. Это сохраняет разрешение ссылок исторических generations. Metadata можно заменить отдельно.

Регистрация нового credential сама по себе не отзывает старый. Удаление старого approver из действующих политик требует обновления всех соответствующих ключей через REFRESH/ROTATE. Уже существующие исторические generations сохраняют свои политики; новый ref не становится для них автоматически допустимым.

### 3.5. Дедупликация

`ref` и digest descriptor не равны криптографической идентичности ключа. Один ключ с разными id, кодировками или параметрами WebAuthn не может дать два голоса.

Требования:

1. Сравнивать нормализованный публичный криптографический ключ и его параметры, а не исходный Base64-текст.
2. Для WebAuthn дополнительно проверять уникальность `(rpId, credentialId)`.
3. При регистрации отклонять тот же credential/ключ под другим id. Повторная регистрация идентичной версии с тем же id идемпотентна.
4. Новая security-версия того же id может содержать прежний ключ с изменённым binding, но обе версии не считаются разными голосами.
5. При валидации политики проверять дубликаты после разрешения всех refs и inline keys; один ключ нельзя включить в одну группу дважды, в том числе один раз inline и один раз через ref.
6. При enforcement считать каждую криптографическую идентичность максимум один раз на группу. Это обязательно независимо от качества и синхронизации registry indexes.
7. Повторный WebAuthn assertion, несколько challenge receipts или несколько aliases одного credential не увеличивают число голосов.

Cross-format сравнение должно распознавать один и тот же P-256 ключ в SIGNATURE и WebAuthn COSE. При этом метод проверки остаётся типизированным: raw signature не удовлетворяет WEBAUTHN entry.

Разные ключи одного человека Keeper определить не может. Этот контроль остаётся у регистратора.

### 3.6. API реестра

Предлагаемые public endpoints:

| Метод и маршрут | Назначение |
| --- | --- |
| `POST /v1/keeper/approvers` | Регистрация SIGNATURE credential |
| `POST /v1/keeper/approvers/webauthn/registration/options` | Начало WebAuthn registration |
| `POST /v1/keeper/approvers/webauthn/registration/finish` | Проверка registration response и создание WEBAUTHN записи |
| `GET /v1/keeper/approvers` | Постраничный список с фильтрами |
| `GET /v1/keeper/approvers/{ref}` | Получение точной security-версии |
| `PUT /v1/keeper/approvers/{ref}/metadata` | Полная замена metadata |

В `{ref}` передаётся URL-encoded полный ref. GET по bare id не подменяет GET точной версии.

Пример signature registration:

```json
{
  "id": "alice",
  "credential": {
    "type": "SIGNATURE",
    "algorithm": "ED25519",
    "publicKey64": "..."
  },
  "metadata": {
    "team": "treasury",
    "displayName": "Alice"
  }
}
```

Сервер проверяет algorithm и key material, нормализует descriptor, проверяет дубликаты, сохраняет запись и возвращает её с вычисленным ref. Algorithm aliases нормализуются существующими средствами. Поддерживаются существующие approval algorithms, доступные в runtime artifact, включая установленные PQC providers. Новый proof of possession для legacy signature registration в scope не входит: доверие к регистратору сохраняется.

`POST /approvers` не принимает произвольный WEBAUTHN descriptor вместо registration ceremony.

Список возвращает `{items, nextCursor}`. Фильтры первой версии: `id`, `type`, точное совпадение `metadata.<key>=<value>`; несколько metadata-фильтров объединяются AND. Default page size 50, maximum 200. Возвращаются все версии, соответствующие фильтру; скрытого выбора latest нет.

Metadata update не меняет ref. Для предотвращения случайной перезаписи возвращать `metadataRevision`/ETag и требовать `If-Match` на update. Revision metadata не используется как credential version. Новая запись возвращается с HTTP 201, идентичная повторная регистрация — 200, конфликт credential — 409, конфликт metadata revision — 412.

### 3.7. Авторизация и хранение

Выделить permissions:

- `tkeeper.approvers.read` — чтение списка и точной записи;
- `tkeeper.approvers.register` — signature registration и выпуск приглашения WebAuthn registration;
- `tkeeper.approvers.metadata` — изменение metadata.

Регистрация сама по себе не делает credential разрешённым ни в одном ключе: право возникает из политики, закрепившей соответствующий ref.

Хранить descriptor, metadata и runtime state раздельно логически, используя существующие DB/storage/integrity механизмы. Сохранение записи и проверка uniqueness indexes должны быть атомарны на локальном Keeper. Повтор того же descriptor возвращает тот же ref; повтор регистрации не должен неожиданно перезаписывать metadata существующей версии.

Security descriptors должны попадать в backup. Записи, необходимые historical processing или Destroy, сохраняются вместе с историей ключей.

## 4. Изменения формата политик

### 4.1. Ключевой FourEye

Сохранить `fourEye.keys` и существующую структуру threshold/mode. Элемент keys становится union:

- legacy inline SIGNATURE: `{algorithm, publicKey64}`;
- pinned registry reference: `{ref}`.

Пример:

```json
{
  "fourEye": {
    "mode": "STRICT",
    "m": 2,
    "n": 3,
    "keys": [
      {"ref": "alice@sha256:<digest-a>"},
      {"ref": "bob@sha256:<digest-b>"},
      {"ref": "carol@sha256:<digest-c>"}
    ]
  }
}
```

Тип credential определяется immutable descriptor по ref. Одна группа может смешивать SIGNATURE и WEBAUTHN. Существующий inline WebAuthn формат ключевого FourEye также сохраняется.

### 4.2. Authority policy / Verdict

Сохранить `policy.approvers` как map локальных aliases. Его значения получают тот же union inline signature / pinned ref:

```yaml
policy:
  id: payment-policy
  fallback: DENY
  approvers:
    treasury-a:
      ref: "alice@sha256:<digest-a>"
    treasury-b:
      ref: "bob@sha256:<digest-b>"
    reserve:
      ref: "carol@sha256:<digest-c>"
  allow:
    - id: approve-payment
      where:
        - "purpose == 'payment'"
      approvals:
        threshold: 2
        approvers: [treasury-a, treasury-b, reserve]
```

`approvals.approvers` продолжает выбирать aliases этой map. Alias вроде `treasury-a` не является mutable registry lookup: значение alias уже содержит полный pinned ref. `fallbackApprovals` использует ту же модель.

Не принимать entry, который одновременно задаёт `ref` и `algorithm/publicKey64`, либо не задаёт ни одного варианта. Для legacy inline authority entries сохранить metadata, не придавая ей смысл разрешения динамической группы.

Verdict 0.3 предоставляет общий контракт Approver и регистрацию типов в AuthorityParser. Verdict проверяет ids, aliases, threshold и дубликаты ids/inline entries. Keeper регистрирует свой тип RegistryApprover, проверяет полный ref и digest descriptor. **Verdict не ходит в DB или сеть Keeper и не выполняет WebAuthn ceremonies.**

Keeper разрешает refs, проверяет digest и runtime key material, выявляет cross-format duplicates. Нельзя продолжать текущую безусловную конверсию каждого Verdict approver в `ExternalPublicKey(algorithm, publicKey64)`.

После изменения policy-файла публикуется новый immutable authority artifact; OCI digest этого artifact обновляется через обычный lifecycle ключа. Редактирование registry metadata не требует нового authority artifact.

## 5. Разрешение refs между peers

Реестр является частью центрального TKeeper. Все текущие участники хранят descriptors, metadata и registration state. Digest из политики закрепляет криптографическое доверие к конкретной версии независимо от metadata.

1. Регистрация и изменение metadata требуют доступности всех текущих участников. Успех возвращается после durable PREPARE/COMMIT на всех; MONO имеет одного текущего участника независимо от настроенных будущих promotion targets.
2. Public management API доступен на любой ноде. Регистратор начинает WebAuthn registration с primary authentication, а владелец credential завершает её по одноразовому приглашению и собственному JWT, в том числе через другую ноду. Общий writer координирует только изменения реестра.
3. При CREATE/REFRESH/ROTATE каждый участвующий peer локально разрешает все refs целевой ключевой политики и всех объявленных approvers authority artifacts, включая резервных. Подпись не делает сетевой lookup и не берёт блокировку изменения реестра.
4. Каждый peer проверяет integrity записи и digest по полному ref. Ref не является URL. Отсутствие descriptor или digest mismatch завершает операцию ошибкой; fallback на bare id, latest, metadata, ключ из proof или inline ключ координатора запрещён.
5. Уже действующая generation не требует доступности writer или ноды, через которую зарегистрировали approver. Исторические generations используют точные сохранённые refs; новых версий и удаления старых descriptors по таймеру нет.
6. ECC/PQC recovery восстанавливает реестр атомарно с ключами; MONO promotion передаёт реестр до импорта policy с refs. Backup включает реестр целиком.
7. TTL ограничивает новый ответ WebAuthn и новые PREPARE-подтверждения. Полностью подтверждённое изменение доставляется surviving peers после падения writer. Частично подписанные intents сохраняют защитные блокировки до согласованного завершения; один таймер не освобождает их.

Descriptors индексируются полным ref/digest. Runtime state WebAuthn хранится отдельно и не подменяет descriptor. Metadata реплицируется, но не участвует в peer authorization и не меняет смысл уже закреплённого ref.

## 6. Блок WebAuthn

### 6.1. Назначение и базовые параметры

WebAuthn используется как метод approval конкретной операции. Login в Keeper, permissions и существующие первичные authenticator/token механизмы сохраняются.

Базовый контракт первой версии:

- Обязательный credential algorithm: ES256 / COSE `-7` / P-256. Дополнительные WebAuthn algorithms не включаются автоматически из defaults выбранной библиотеки.
- Требуются User Presence и User Verification; `userVerification = required` на registration и assertion. Понижения до preferred/discouraged нет.
- Разрешены platform и roaming authenticators, а также backup-eligible credentials. Одна синхронизированная credential даёт один голос независимо от количества устройств.
- Attestation preference: `none`; сертификатная проверка происхождения аппаратного устройства и vendor allowlists не реализуются.
- В первой версии запрещён cross-origin/iframe flow; AppID/U2F compatibility extensions не включаются.

Это не обещание независимых людей, аппаратной неэкспортируемости или независимых failure domains. Их обеспечивает регистратор и выбранный им authenticator deployment.

### 6.2. Конфигурация RP

Предлагаемая конфигурация:

```hocon
keeper.webauthn {
  enabled = true
  rp-id = "approvals.example.com"
  rp-name = "Keeper approvals"
  origins = ["https://approvals.example.com"]
  registration-ttl = 5m
}
```

RP ID и origins задаются оператором и не выводятся из непроверенного Host/Forwarded заголовка. Для production нужен HTTPS approval frontend с подходящим RP ID; локальная разработка допускает отдельную явно заданную localhost-конфигурацию.

При регистрации security-параметры RP копируются в descriptor. Assertion проверяется по origins закреплённого descriptor. Текущая keeper.webauthn конфигурация управляет регистрацией и проверкой registration sessions; её изменение не отзывает ранее закреплённые credentials. Для изменения approval origins нужна новая версия descriptor и обновление политики через REFRESH/ROTATE.

Изменение pinned origins, RP ID или UV requirement требует нового descriptor/ref и REFRESH/ROTATE. Перенос на другой RP ID обычно требует новой WebAuthn регистрации; он не выполняется переписыванием записи.

Отключение keeper.webauthn запрещает новые регистрации; проверка ранее закреплённых WebAuthn approvals продолжает использовать descriptor. Если необходимый verifier или algorithm provider недоступен, операция завершается ошибкой. Автоматической замены на SIGNATURE нет.

### 6.3. Выбор реализации

Использовать готовую JVM WebAuthn server library для COSE/CBOR, registration и assertion verification. Предпочтительный кандидат — Yubico `java-webauthn-server`; окончательно зафиксировать совместимую стабильную версию при реализации. Не писать собственный WebAuthn verifier поверх текущего raw-signature FourEye.

У библиотеки есть start/finish registration и assertion, а origin matching и signature counter behavior настраиваются явно. Defaults нужно проверить: произвольные subdomains/ports не разрешаются; strict counter rejection не должен случайно появиться в повторных guard checks. [Yubico RelyingParty API](https://developers.yubico.com/java-webauthn-server/JavaDoc/webauthn-server-core/latest/com/yubico/webauthn/RelyingParty.html).

### 6.4. Регистрация

Начало:

```http
POST /v1/keeper/approvers/webauthn/registration/options
```

```json
{
  "id": "alice",
  "metadata": {
    "displayName": "Alice",
    "team": "treasury"
  }
}
```

Ответ содержит `registrationId`, `invitation`, `expiresAt` и standard JSON representation `PublicKeyCredentialCreationOptions` в поле `publicKey`. Для начала нужны primary authentication и `tkeeper.approvers.register`.

Сервер создаёт registration challenge из 32 CSPRNG bytes, opaque userHandle и registration session. Session закрепляет id, metadata, RP parameters, допустимые algorithms и авторизованного инициатора. Время жизни по умолчанию 5 минут. `excludeCredentials` включает известные credentials того же id/RP; серверная проверка uniqueness остаётся обязательной.

`invitation` — отдельный секрет из 32 CSPRNG bytes в canonical unpadded Base64url. `registrationId` вычисляется как Base64url `SHA-256(UTF8("TKEEPER_WEBAUTHN_REGISTRATION_INVITATION_V1") || 0x00 || invitationBytes)`. Сессия хранит только hash; его знание не разрешает finish. Одна сессия соответствует одному приглашению. Генерацию ссылок и доставку выполняет внешний management.

Frontend вызывает `navigator.credentials.create({publicKey})` и передаёт результат:

```http
POST /v1/keeper/approvers/webauthn/registration/finish
```

```json
{
  "invitation": "...",
  "credential": {
    "id": "<base64url>",
    "rawId": "<base64url>",
    "type": "public-key",
    "response": {
      "clientDataJSON": "<base64url>",
      "attestationObject": "<base64url>",
      "transports": ["usb"]
    },
    "clientExtensionResults": {}
  }
}
```

Finish требует primary authentication (JWT в production) и приглашение из body; дополнительные registry permissions не требуются. Writer повторно проверяет пересланный JWT. Сессия сохраняет регистратора, но владелец credential может быть другим человеком. Поля id, metadata и RP нельзя переопределить в finish. Владение приглашением разрешает enrollment под заданным id; проверка личности получателя остаётся у регистратора. Каждый peer независимо проверяет приглашение и WebAuthn response до PREPARE-подписи.

Проверить session, expiry, `webauthn.create`, исходный challenge, origin/RP, UP/UV, допустимый algorithm, registration response и uniqueness. Ключ и параметры берутся из проверенного результата. Успешное сохранение descriptor, начального runtime state и consume session атомарно. Два конкурентных finish не создают две записи. Идентичный повтор успешно завершённого finish может вернуть сохранённый результат; другой response для consumed session отклоняется. [WebAuthn registration](https://www.w3.org/TR/webauthn-2/#sctn-registering-a-new-credential).

Сессии и consume-состояние успешной регистрации сохраняются после рестарта и переносятся существующим snapshot/recovery/promotion flow. Однократность обеспечивается резервированием точного response/ref по session id до выдачи PREPARE-подписи. Ошибочный токен или WebAuthn response не сжигает корректное приглашение.

### 6.5. Подготовка approval

Добавить базовый endpoint, независимый от optional mandate feature:

```http
POST /v1/keeper/approvals/prepare
```

```json
{
  "type": "sign",
  "operation": {
    "keyId": "payments-key",
    "command": {
      "type": "custom",
      "authorityId": "payments",
      "artifact": {
        "scheme": "ECDSA",
        "hash": "SHA256",
        "typed": {"purpose": "payment", "amount": "1000"}
      }
    },
    "approvals": {
      "keeperId": 1,
      "nonce": "unique-operation-nonce",
      "timestamp": 1791580000000,
      "proofs": []
    }
  },
  "approverRefs": ["alice@sha256:<digest-a>"]
}
```

Поддержать types `sign`, `dkg`, `decrypt`, `destroy`, используя реальные существующие request models и их hashing. Для dkg применяются CREATE/REFRESH/ROTATE; CREATE с отсутствующим старым требованием не создаёт approval requirement из целевой политики.

Caller должен иметь обычное разрешение на запрашиваемую операцию. Prepare не выдаёт право исполнить её и не заменяет обычную авторизацию. Для preparation использовать те же key-state capture, authority evaluation и collectors требований, что при исполнении; не копировать policy evaluator в отдельную ветку.

В operation заранее присутствуют окончательные `keeperId`, `nonce`, `timestamp`; proofs пусты. Prepare не меняет бизнес-поля или approval envelope. Проверяются keeperId, nonce, timestamp и оставшееся время approval TTL. Возвращаются effective operation/hash и все обязательные группы. Если указанный ref не входит ни в одну применимую группу, challenge для него не выдаётся.

`approverRefs` выбирает WEBAUTHN credentials, для которых нужны options. Он не меняет требуемый threshold. Если список пуст, endpoint может работать как preview без выдачи challenges. Повторный prepare создаёт новые challenge ids; прежний challenge для той же неизменённой операции остаётся пригодным до expiry/admission.

Ответ по смыслу:

```json
{
  "hashForSigning64": "<existing operation hash>",
  "requirements": [
    {
      "sourceType": "KEY",
      "keyId": "payments-key",
      "generation": 4,
      "threshold": 2,
      "approvers": [
        {"ref": "alice@sha256:<digest-a>", "type": "WEBAUTHN"},
        {"ref": "bob@sha256:<digest-b>", "type": "SIGNATURE"},
        {"ref": "carol@sha256:<digest-c>", "type": "SIGNATURE"}
      ]
    }
  ],
  "webauthn": [
    {
      "approverRef": "alice@sha256:<digest-a>",
      "challengeId": "...",
      "expiresAt": 1791580300000,
      "binding": "<issuer-signed challenge receipt>",
      "publicKey": {
        "challenge": "<base64url 32 random bytes>",
        "rpId": "approvals.example.com",
        "allowCredentials": [
          {"type": "public-key", "id": "<credentialId>"}
        ],
        "userVerification": "required",
        "timeout": 300000
      }
    }
  ]
}
```

Authority groups дополнительно содержат `policyId` и rule/fallback `source`; результат должен показывать все группы, а не только authority-only case. `timeout` ограничивается реальным оставшимся TTL. Browser timeout не заменяет серверную проверку срока.

### 6.6. Challenge binding и peers

Нельзя использовать только `hashForSigning` или клиентский nonce как WebAuthn challenge. Challenge генерирует сервер; assertion проверяется против выпущенного значения. [WebAuthn cryptographic challenges](https://www.w3.org/TR/webauthn-3/#sctn-cryptographic-challenges).

Сервер связывает случайный challenge со следующими полями:

- purpose/domain `TKEEPER_WEBAUTHN_APPROVAL_V1` и version;
- challengeId, challenge bytes, issuedAt, expiresAt;
- coordinator/issuer peerId;
- operation type, keyId, operation `hashForSigning`;
- generation, чья действующая политика проверяется: active source для REFRESH/ROTATE, реально выбранная generation для Sign/Decrypt/Destroy;
- digest применимых approval groups и pinned authority references;
- точный approverRef и RP security binding.

Digest групп строится из semantic public data: threshold, источники требований, pinned refs/нормализованные inline keys и security descriptors. В него не входят metadata или peer-local ciphertext/storage revision bytes. Группы нормализуются детерминированно, одинаково на peers.

TTL assertion по умолчанию 5 минут, но `expiresAt` не позже `approvals.timestamp + keeper.approval.ttl`. Challenge store coordinator содержит выпущенный binding и состояние admission.

Чтобы остальные peers проверяли issuance независимо от памяти coordinator, передавать issuer-signed receipt `binding`, подписанный существующим keeper integrity key с отдельным domain separator. Это подтверждение issuance, не новая approval и не authentication token.

Зафиксировать transport receipt как Base64url от canonical JSON `{payload, signature64}`. Payload содержит перечисленные binding fields, а также `integrityKeyVersion`, algorithm и fingerprint ключа issuer. Подписываются 32 bytes `SHA-256(UTF-8("TKEEPER_WEBAUTHN_RECEIPT_V1") || 0x00 || canonicalJsonBytes(payload))`. Algorithm/version/fingerprint сверяются с trusted peer identity, а не выбирают произвольный ключ из запроса. Receipt имеет собственную version; это не изменение версии operation hash.

Каждый peer:

1. Проверяет подпись receipt доверенным ключом configured issuer; ключ, присланный в proof, не является trust root.
2. Сверяет issuer с coordinator/authenticated peer, expiry, operation hash/type, generation, группы и точный ref со своим operation state.
3. Проверяет assertion по закреплённому descriptor.

Coordinator дополнительно проверяет, что receipt соответствует реально выпущенной локальной session и не consumed другой admission.

Receipt содержит integrity key version. Проверка старой версии после integrity rotation должна использовать аутентифицированную историческую public key identity. Если её надёжное получение недоступно, challenge отклоняется и требуется новый prepare; нельзя принимать вложенный ключ без проверки. Не копировать optional mandate protocol целиком: использовать существующие signer и peer identity primitives.

Proof/receipt относятся к одной точной операции. После изменения полей, generation или security-требований требуется новый prepare. Metadata update не инвалидирует challenge.

### 6.7. Формат proofs

Сохранить legacy proof:

```json
{"fingerprint": "<existing fingerprint>", "signature64": "..."}
```

Отсутствие `type` означает только legacy SIGNATURE; это не общий fallback для WebAuthn.

Новый SIGNATURE proof:

```json
{
  "type": "SIGNATURE",
  "approverRef": "bob@sha256:<digest-b>",
  "signature64": "..."
}
```

Legacy fingerprint proof может соответствовать разрешённому SIGNATURE descriptor после разрешения ref, если fingerprint совпадает; для WEBAUTHN он непригоден.

Новый WEBAUTHN proof:

```json
{
  "type": "WEBAUTHN",
  "approverRef": "alice@sha256:<digest-a>",
  "binding": "<issuer-signed challenge receipt>",
  "credential": {
    "id": "<base64url>",
    "rawId": "<base64url>",
    "type": "public-key",
    "response": {
      "clientDataJSON": "<base64url>",
      "authenticatorData": "<base64url>",
      "signature": "<base64url>",
      "userHandle": "<base64url or null>"
    },
    "clientExtensionResults": {}
  }
}
```

Frontend получает credential через `navigator.credentials.get({publicKey})`. Binary-поля передаются как Base64url; исходные bytes `clientDataJSON` сохраняются без пересериализации до проверки подписи.

Все variants могут присутствовать в одном `approvals.proofs`. Новые security DTO разбираются строго: неизвестный type, несовместимые поля, duplicate keys или malformed encoding отклоняются. Для legacy unknown fingerprint сохранить существующую семантику: он не даёт голос.

### 6.8. Проверка WebAuthn assertion

Проверить credential type/id/rawId, `webauthn.get`, ожидаемый challenge, точный origin, RP ID hash, UP и UV, userHandle при наличии, backup eligibility и допустимый algorithm. Cross-origin response не допускается. Подпись проверяется над `authenticatorData || SHA-256(clientDataJSON)` исходных bytes по public COSE key. Использовать WebAuthn signature encoding библиотеки; ES256 assertion нельзя передать как keeper compact ECDSA proof над operation hash. [WebAuthn assertion verification](https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion).

Любая неверная криптографическая проверка или binding не даёт голос. Явный type mismatch или подмена descriptor/ref — ошибка запроса/политики, без downgrade. Неизвестные extensions не могут менять RP/UV/challenge checks; AppID отключён.

### 6.9. Runtime state и admission

Хранить отдельно от descriptor: `signCount`, текущее backup state, lastUsedAt; transports — только browser hints. Эти значения не меняют ref.

Это локальные наблюдения coordinator, не глобально согласованный счётчик кластера. Для версий одной WebAuthn credential runtime record индексируется `(rpId, credentialId)`; добавление новой версии descriptor не сбрасывает накопленный counter. Peer-local observations не участвуют в digest групп или решении о distinct votes.

Для первой версии counter anomaly используется как audit signal, без автоматического отказа только из-за неувеличившегося counter. Это учитывает zero-counter credentials, параллельные assertions и повторную проверку того же proof. Сохранённый counter обновляется как `max(stored, observed)`; replay protection обеспечивают challenge binding и approval nonce. [WebAuthn signature counter considerations](https://www.w3.org/TR/webauthn-3/#sctn-sign-counter).

Обязательное разделение:

- Preview/guard/peer verification — проверки без consume challenge и без обновления counter.
- Coordinator admission — после проверки всех групп, в одной транзакционной границе с nonce admission: consume approval nonce, закрепление использованных challenge ids за этой admission, обновление runtime state.
- Внутренние protocol retries того же допущенного исполнения — повторная криптографическая проверка без повторного consume.

Текущий guard вызывает FourEye verification и при guard, и при admit. Новый stateful verifier не должен ломаться на втором вызове. Не делать скрытую DB mutation внутри library credential lookup или signature verifier.

Если не хватает approvals или проверка не прошла, валидные challenges остальных approvers не расходуются. Две конкурентные внешние подачи одной операции не могут обе пройти admission. Если операция упала после успешного admission, новая внешняя попытка требует нового nonce/prepare по текущему контракту; DKG/session retries внутри допущенной попытки сохраняют proof.

Consumed nonce/challenge state должно переживать restart и храниться дольше возможного срока действия доказательства. Нескончаемый replay cache не требуется. Не-coordinator peers, как сейчас, не расходуют внешний approval nonce самостоятельно. Гарантия replay между peers остаётся в пределах существующего coordinator threat model; receipt не даёт exactly-once при злонамеренном coordinator.

## 7. Замена и потеря approver

Обычный сценарий для `2-of-3`:

1. В текущей политике закреплены Alice H1, Bob H1, Carol H1.
2. Alice теряет credential; регистратор проверяет её вне Keeper и создаёт Alice H2.
3. Bob и Carol разрешают точный REFRESH/ROTATE, в целевой политике которого Alice H1 заменена на Alice H2.
4. Новая generation активируется с новой политикой; подпись Alice H1 не требуется.

Применять тот же принцип к legacy и WebAuthn credentials, а также смешанным quorum. Старые публичные descriptors сохраняются для прежних generations.

Если доступных ключевых approvers меньше m, обновление защищённой политики невозможно. Keeper не снижает threshold, не принимает credential с тем же id и другим hash, не использует seal shares и не даёт registry admin override.

Владелец политики выбирает запас `n - m`. Для каждой обязательной authority group резерв считается отдельно. Потеря approver authority-only группы может остановить соответствующий signing intent, но сама по себе не добавляет запрет на lifecycle сверх ключевого FourEye.

При compromised credential новый ref не является мгновенным глобальным отзывом старого: необходим lifecycle всех затронутых ключей; исторические generations рассматриваются отдельно согласно существующим processing/destroy правилам.

## 8. Интеграция с текущей архитектурой

| Компонент | Необходимое изменение |
| --- | --- |
| Verdict Approver / parser / compiler | Union inline/ref, обязательный hash, сохранение refs в requirements |
| Keeper key policy models | Union inline/ref без изменения m/n/mode semantics |
| KeyAuthorityCompiler | Разрешение refs, digest и crypto validation, проверка distinct вместо unconditional ExternalPublicKey mapping |
| FourEye collectors | Общая typed resolved credential model для key/authority groups |
| FourEye enforcement | Dispatch SIGNATURE/WEBAUTHN, distinct vote counting, cumulative groups |
| OpGuardChain / KeyOperationControl | Повторные чистые проверки и атомарный admission runtime state |
| Internal attestations / keygen / signing / decrypt / destroy | Передача proofs, receipts и необходимых pinned public descriptors; независимая проверка peers |
| DB / consistency / recovery / backup | Durable descriptors и runtime state; перенос необходимого generation side-state |
| Optional mandate | Typed requirements/refs и новые proofs; prepare работает и без этого feature |
| Java SDK | Registry/registration/prepare API, typed proof DTO, key-policy refs, authority approver union |
| External UI | Legacy compatibility и контракт будущего выбора refs/сбора browser proofs |
| Документация | Новые flows, конфигурация RP, API, migration и ответственность за запас |

Переиспользовать существующие operation parsers/hashers, guards, validators, transaction/storage и keeper integrity primitives. Не вводить отдельный policy evaluator, пользовательскую IAM-систему или независимый crypto framework.

Внешние/internal DTO не должны терять `type`, ref, receipt или assertion при сериализации. Proof dispatch одинаков в coordinator и peers.

## 9. SDK и контракт для UI

Java SDK:

- Добавить Approvers module и модели записи, descriptor, refs, metadata/list filters.
- Добавить registration options/finish и approvals prepare models/methods.
- Добавить typed SIGNATURE/WEBAUTHN proofs; сохранить возможность создать существующий `new Approvals.Proof(fingerprint, signature64)` либо явно совместимый adapter.
- Не заставлять Java SDK самостоятельно общаться с аппаратным authenticator: SDK принимает сериализованный browser result.
- Поддержать refs в key-level policy и Verdict-facing DTO; обеспечить одинаковые canonical bytes с Keeper.

Backend API и SDK входят в эти два блока реализации. Полноценный новый экран управления approvers в текущий scope не включается; metadata и фильтры подготавливаются для его последующего добавления. Внешние UI-клиенты должны сохранять совместимость с legacy policies.

Для последующей интеграции UI предусмотреть:

- Добавить регистрацию signature и WebAuthn approver, просмотр refs и metadata.
- В policy builder позволить выбрать registry entry по имени/команде и сохранить полный ref; полный hash остаётся доступен для проверки/копирования.
- Поддержать фильтр metadata, прежде всего team, и редактирование metadata без изменения credential.
- Сохранить legacy inline signature input для существующих сценариев.
- Для WebAuthn approval использовать prepare, показать точную операцию и обязательные группы, вызвать browser API и добавить assertion в общий envelope.
- Отмена browser prompt не отправляет пустой/поддельный proof; другие собранные approvals не удаляются.
- При `m = n` показать отсутствие резерва. Значения выше текущих backend limits UI не предлагает.

Метадата помогает выбирать entry, но отображаемая команда не заменяет проверку полного ref. UI не пересчитывает состав действующей политики из результатов фильтра автоматически.

## 10. Совместимость и rollout

1. Существующие inline key/authority policies и legacy proofs продолжают работать без регистрации в новом реестре.
2. Существующие signature `hashForSigning` vectors не меняются. Proofs, WebAuthn receipts и resolved descriptors не добавляются в preimage операции.
3. Новая target policy содержит refs буквально, включая digest; они входят в существующий canonical hash REFRESH/ROTATE. Разрешённый descriptor не подставляется вместо ref при вычислении этого hash.
4. Metadata из реестра не добавляется в policy или operation hash автоматически.
5. Existing authority artifacts не переписываются. Новые ref-based artifacts требуют версии Verdict с соответствующим parser/compiler и обновления Keeper dependency, сейчас pinned на 0.2.1.
6. Сначала обновить Keeper/SDK/Verdict на всех участвующих peers, затем создавать ref/WebAuthn policies. Старый peer должен отказать на неизвестном формате; mixed-version silent downgrade недопустим.
7. DB migration добавляет новые stores/records, без переписывания старых immutable policies и key generations.
8. При переходе inline → ref требуются те же действующие approvals на REFRESH/ROTATE; регистрация того же public key не меняет старую политику автоматически.

## 11. Ошибки, лимиты и аудит

### 11.1. Ошибки

Сохранить общую keeper error envelope. Предусмотреть различимые причины:

| Причина | Предлагаемый код |
| --- | --- |
| Некорректный id/descriptor/ref | `INVALID_APPROVER`, `INVALID_APPROVER_REF` |
| Нет точной записи | `APPROVER_NOT_FOUND` |
| Credential уже зарегистрирован под другим id | `APPROVER_ALREADY_REGISTERED` |
| Descriptor не соответствует policy pin | `APPROVER_DIGEST_MISMATCH` |
| Неизвестный proof type / несовместимые поля | `INVALID_APPROVAL_PROOF` |
| Registration session отсутствует/истекла/использована | `WEBAUTHN_REGISTRATION_INVALID` |
| Challenge отсутствует/истёк/имеет неверный binding | `WEBAUTHN_CHALLENGE_INVALID` |
| Assertion не прошёл WebAuthn checks | `WEBAUTHN_ASSERTION_INVALID` |
| Не хватает approvals | Существующие `APPROVAL_REQUIRED` / `POLICY_VIOLATION` |
| WebAuthn выключен или algorithm не поддержан | Явная unsupported/configuration error |

Не раскрывать записи каталога неавторизованному caller через различие prepare/registration ошибок. Ошибки signature verification и cryptographic internals не должны содержать key material или полные ceremony blobs.

Расширить structured approval details до необходимых групп/refs/types, сохранив существующие policyId/source/threshold. Старые клиентские DTO должны либо корректно игнорировать добавленные optional fields, либо получить документированное обновление; не предполагать это без wire tests.

### 11.2. Лимиты первой версии

| Поле | Лимит |
| --- | --- |
| Approver id | 1–128 ASCII characters по regex выше |
| Metadata | До 32 пар; key 1–64 UTF-8 bytes, value до 512 UTF-8 bytes; суммарно до 16 KiB |
| Group size / общий proofs array | Существующий максимум 256 |
| CredentialId | До 1024 decoded bytes |
| clientDataJSON | До 8 KiB decoded bytes |
| Registration credential payload | До 128 KiB |
| Assertion credential payload | До 64 KiB |
| Registration TTL / assertion TTL | Default 5 минут; assertion дополнительно ограничен approval TTL |

Большой operation body проверяется существующими endpoint limits. Все encoded-поля проверяются до дорогостоящей обработки; CBOR/JSON parsing ограничены по размеру и глубине. Ограничить число незавершённых sessions на caller и node существующим rate-limit механизмом либо небольшим bounded store. Unbounded maps/queues недопустимы.

### 11.3. Аудит

Фиксировать регистрацию версии, metadata update, выдачу и использование challenge, успешные/неуспешные approval checks, counter anomaly, lifecycle-переход с заменой refs.

Для approval фиксировать ref, method, crypto fingerprint, challengeId, operation hash и источники удовлетворённых групп. Различать submitted proofs и фактически проверенные голоса; неверный proof не должен выглядеть как успешное одобрение.

Не логировать raw WebAuthn blobs, userHandle, bearer tokens или полный challenge receipt без необходимости. Metadata не включать целиком в каждое событие.

## 12. Критерии приёмки

### 12.1. Approvers и pinning

- SIGNATURE registration проверяет material/algorithm и возвращает воспроизводимый ref.
- Metadata update, порядок metadata и timestamps не меняют ref.
- Изменение любого security field меняет digest; bare id и сокращённый hash отклоняются.
- Эквивалентные public key encodings нормализуются одинаково. Есть фиксированные canonical descriptor/digest fixtures.
- H2 не изменяет разрешение H1. Подмена descriptor в реестре или forwarded material отклоняется каждым peer.
- Duplicate key через aliases, разные refs, inline/ref и SIGNATURE/COSE не даёт два голоса.
- Immutable descriptor переживает restart/backup/restore; старые generations разрешают свои refs.
- Фильтры metadata, pagination и conditional metadata update работают без изменения policies.

### 12.2. WebAuthn

- Успешная registration и assertion для ES256, с UP/UV.
- Отказ при wrong challenge, origin, RP ID, credentialId, userHandle, type, UV/UP, signature, algorithm и malformed JSON/CBOR.
- Истёкшая registration/challenge и повторное завершение другой response не создают credential/голос.
- Credential из другой registry entry и raw signature тем же ключом не обходят WEBAUTHN requirement.
- Изменение операции, nonce, keeperId, generation, policy binding или challenge receipt делает proof непригодным.
- Receipt проверяется trusted issuer identity; вложенный неизвестный key и подделанная key version не принимаются.
- Zero/non-increasing counters не ломают легитимный admission; anomaly попадает в аудит, counter не откатывается назад.

### 12.3. Quorum и lifecycle

- Работают signature-only, WebAuthn-only и mixed m-of-n groups.
- Все matching authority groups и ключевая группа cumulative; один proof может закрывать разрешённые позиции разных групп.
- STRICT/LENIENT и authority-only behavior соответствуют разделу 2.
- Bob и Carol выполняют REFRESH при потере Alice в 2-of-3; новый ref работает после активации, старый не заменяет его.
- При потере quorum Keeper отказывает; registry admin и seal shares не обходят approval.
- Целевая policy с ref входит в существующий hashForSigning REFRESH/ROTATE; изменение target ref требует новых approvals.

### 12.4. Peers, replay и совместимость

- WebAuthn proof проходит guard и admit без побочных эффектов второй проверки.
- Неполный quorum не расходует challenges/nonce валидных approvers.
- Concurrent external submissions одной approval допускаются максимум один раз; restart не открывает replay window.
- Internal signing/keygen/decrypt/destroy retries проверяют исходные proofs без повторного consume.
- Peer с отсутствующим material получает точный descriptor, сверяет pin и сохраняет его; offline registry node не ломает уже активированную generation.
- Descriptor side-state переносится при consistency/recovery и не теряется при восстановлении повреждённого peer.
- Prepare работает без mandate; mandate build продолжает возвращать корректные typed requirements.
- Existing inline policy/proof wire fixtures и canonical operation hash vectors остаются действительными.
- Работают mono и threshold mode; проверка нового формата есть на каждом peer, а не только coordinator.
- Минимальный browser E2E с virtual authenticator покрывает create/get, сбор смешанного quorum и отмену prompt.

Тесты должны проверять trust boundaries и конечное поведение. Не требуется переписывать существующий test suite или добавлять дублирующие проверки каждого DTO getter.

## 13. Порядок реализации двух блоков

**Блок 1 — Approvers:** descriptor/ref/digest и canonical fixtures; локальный registry API/storage; refs в Verdict и Keeper; resolution/pinning/material propagation; SDK и сохранение legacy behavior.

**Блок 2 — WebAuthn:** RP config и library; registration; prepare/challenge receipt; typed proof verification и admission; peer integration; SDK и browser integration example; сценарии смешанного quorum и lifecycle.

Общий end-to-end результат: зарегистрировать legacy и WebAuthn approvers, выбрать их pinned refs в ключевой и authority политике, собрать mixed approvals для точной операции, выполнить её через Keeper, затем заменить потерянный credential обычным REFRESH с оставшимся quorum.

## 14. Вне текущего scope и принятые ограничения

- Emergency/recovery bypass, seal-share authorization, отдельные recovery approvers.
- Отдельный UPDATE_POLICY/policyRevision механизм и отказ от REFRESH/ROTATE для изменения политики.
- Keeper user accounts, проверка личности, гарантия distinct humans, генерация и доставка invitation-ссылок.
- Несколько credentials внутри одной approver-записи и автоматический перенос голоса между credentials.
- Bare/mutable refs и автоматическая подстановка latest.
- WebAuthn как login/primary authentication для API Keeper.
- Hardware attestation trust stores, vendor allowlists, hardware-only policy, U2F/AppID migration.
- Inline WebAuthn descriptors в policy-файлах и обязательные algorithms сверх ES256 в первой версии.
- Строго согласованный глобальный metadata-каталог, consensus или distributed identity service.
- Полноценные новые UI-экраны управления approvers; API/SDK и browser flow должны позволять добавить их отдельно.
- Изменение quorum топологии и алгоритмов reshare ради этого функционала.

Принятые ограничения: без доступного quorum защищённую политику изменить нельзя; registry registration не является глобальным отзывом credential; historical generations сохраняют свои pins. Запас и независимость custodians обеспечивает владелец политики.

## 15. Опорные точки текущего кода

Пути приведены относительно корня соответствующего repository:

| Repository | Файл / область |
| --- | --- |
| threshold-keeper | `src/main/kotlin/org/exploit/keeper/service/control/FourEyeControl.kt` |
| threshold-keeper | `src/main/kotlin/org/exploit/keeper/service/guard/FourEyeApprovalGuard.kt`, `FourEyeKeyPolicyCollector.kt`, `OpGuardChain.kt` |
| threshold-keeper | `src/main/kotlin/org/exploit/keeper/service/operation/KeyOperationControl.kt` |
| threshold-keeper | `src/main/kotlin/org/exploit/keeper/service/authority/KeyAuthorityCompiler.kt` |
| threshold-keeper | `src/main/kotlin/org/exploit/keeper/model/approval/`, `model/keyset/control/`, `model/api/incoming/Generate.kt` |
| threshold-keeper | `src/main/kotlin/org/exploit/keeper/service/keygen/activation/KeySetActivationService.kt` |
| threshold-keeper | `src/main/kotlin/org/exploit/keeper/service/integrity/KeeperInternalSigner.kt`, `service/nonce/NonceStore.kt` |
| threshold-keeper | `features/mandate/`, `features/recovery/`, `sdk/`, core control-plane API |
| threshold-keeper | `docs/security-model/four-eye-control.md`, `integration-tests/functional/.../FourEyeControlTests.kt` |
| verdict | `src/main/java/org/exploit/verdict/model/approval/Approver.java`, `ApprovalPolicy.java` |
| verdict | `src/main/java/org/exploit/verdict/model/evaluation/ApprovalRequirement.java`, `compiler/PolicyRuleValidator.java` |
| verdict | `verdict-authority/src/main/java/org/exploit/verdict/authority/AuthorityParser.java` |

Работа в Verdict выполняется с соблюдением внешних project rules; эти правила в repository не копируются. Продуктовый код и существующие политики в ходе подготовки этого ТЗ не изменялись.
