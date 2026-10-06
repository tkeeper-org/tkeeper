# Asset Inventory

Asset inventory lists keys, active generations, authorities, owners, destruction state, and integrity status. Use `historical=true` with a `logicalId` to include that key's older generations.

Endpoint:

```http
GET /v1/keeper/compliance/inventory
```

Query params:

| Param | Meaning |
| --- | --- |
| `logicalId` | filter by key id |
| `assetOwner` | filter by owner |
| `historical` | include old generations; requires `logicalId` |
| `lastSeen` | cursor |
| `limit` | max 200 |

Required permission:

```text
tkeeper.compliance.inventory
```

Example:

```bash
curl \
  -H 'X-DEV-TOKEN: dev-token' \
  'http://localhost:8080/v1/keeper/compliance/inventory?logicalId=deployment-signing&assetOwner=customer-42&historical=true'
```

Response shape:

```json
{
  "inventory": {
    "generatedAt": 1760000000000,
    "peerId": 1,
    "threshold": 2,
    "totalPeers": 3,
    "items": [
      {
        "logicalId": "deployment-signing",
        "status": "ACTIVE",
        "currentGeneration": 1,
        "authorities": [
          {
            "id": "production-deployment",
            "oci": "oci://registry.example/verdict/authorities/production-deployment@sha256:..."
          }
        ],
        "algorithm": "SECP256K1",
        "createdAt": 1760000000000,
        "updatedAt": 1760000000000,
        "policy": null,
        "hasActiveKey": true,
        "lastPendingGeneration": null,
        "assetOwner": "customer-42",
        "tampered": false
      }
    ]
  },
  "nextCursor": null,
  "hasMore": false
}
```

The [Control Plane UI](../deployment/control-plane-ui.md) can export inventory when the `ui` feature is included.

`tampered = true` means local signed metadata failed integrity verification while inventory was being read.

Investigate `tampered = true` as a security incident. Stop relying on that node's inventory or key state until the cause is understood.

During reconciliation, compare this node's inventory with peer generations, audit history, and external ownership records.

## Common problems

### Inventory is empty

Check permissions first. Then check whether the key was created on this cluster and whether you are filtering by `assetOwner`, `logicalId`, or cursor.
