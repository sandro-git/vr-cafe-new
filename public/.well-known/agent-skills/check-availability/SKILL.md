# check-availability

Check available VR session time slots at VR Café Lyon for a given date, number of players, duration, and VR type.

## MCP Tool

**Endpoint:** `https://www.vr-cafe.fr/api/mcp`
**Method:** `tools/call` → `check_availability`

## Input Schema

```json
{
  "type": "object",
  "required": ["date", "nb_personnes", "duree_minutes", "vr_type"],
  "properties": {
    "date": {
      "type": "string",
      "description": "Date to check (YYYY-MM-DD)"
    },
    "nb_personnes": {
      "type": "integer",
      "minimum": 1,
      "maximum": 6,
      "description": "Number of players"
    },
    "duree_minutes": {
      "type": "integer",
      "enum": [30, 60, 90],
      "description": "Session duration in minutes"
    },
    "vr_type": {
      "type": "string",
      "enum": ["filaire", "sans_fil"],
      "description": "filaire = wired VR, sans_fil = wireless VR"
    }
  }
}
```

## Output

A list of available time slots (HH:MM format) for the requested date and configuration, or a message indicating the café is closed.

## Example

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "check_availability",
    "arguments": { "date": "2025-05-10", "nb_personnes": 2, "duree_minutes": 60, "vr_type": "sans_fil" }
  }
}
```
