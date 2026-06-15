# list-games

List VR games available at VR Café Lyon, with optional category filtering.

## MCP Tool

**Endpoint:** `https://vr-cafe.fr/api/mcp`
**Method:** `tools/call` → `list_games`

## Input Schema

```json
{
  "type": "object",
  "properties": {
    "tag": {
      "type": "string",
      "enum": ["jeuxVR", "escapeGame", "freeroaming", "escapeFreeroaming"],
      "description": "Category filter: jeuxVR (wired VR games), escapeGame (wired escape rooms), freeroaming (wireless VR games), escapeFreeroaming (wireless escape rooms)"
    }
  }
}
```

## Output

A markdown list of games with name, URL, number of players, duration, and difficulty.

## Example

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "list_games", "arguments": { "tag": "escapeGame" } }
}
```
