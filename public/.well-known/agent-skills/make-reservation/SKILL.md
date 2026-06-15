# make-reservation

Book a VR session at VR Café Lyon. Inserts the reservation into the database, assigns a VR room, sends a confirmation email to the client, and notifies admins.

## MCP Tool

**Endpoint:** `https://vr-cafe.fr/api/mcp`
**Method:** `tools/call` → `create_reservation`

## Input Schema

```json
{
  "type": "object",
  "required": ["client_nom", "client_email", "client_telephone", "nb_personnes", "duree_minutes", "vr_type", "creneau_debut"],
  "properties": {
    "client_nom": { "type": "string", "description": "Client full name" },
    "client_email": { "type": "string", "format": "email" },
    "client_telephone": { "type": "string" },
    "nb_personnes": { "type": "integer", "minimum": 1, "maximum": 6 },
    "duree_minutes": { "type": "integer", "enum": [30, 60, 90] },
    "vr_type": { "type": "string", "enum": ["filaire", "sans_fil"] },
    "creneau_debut": {
      "type": "string",
      "format": "date-time",
      "description": "Session start (ISO 8601, e.g. 2025-05-10T14:00:00)"
    },
    "notes": { "type": "string" }
  }
}
```

## Output

Confirmation message with the booking reference, datetime, number of players, VR type, room name, and total price. A confirmation email is sent to the client.

## Pricing

- 30 min: 18 €/person
- 60 min: 29 € (1–2 players), 27 € (3–4 players), 25 € (5–6 players) per person

## Example

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_reservation",
    "arguments": {
      "client_nom": "Marie Dupont",
      "client_email": "marie@example.com",
      "client_telephone": "0612345678",
      "nb_personnes": 2,
      "duree_minutes": 60,
      "vr_type": "sans_fil",
      "creneau_debut": "2025-05-10T14:00:00"
    }
  }
}
```
