# get-pricing

Get VR session pricing at VR Café Lyon.

## MCP Tool

**Endpoint:** `https://vr-cafe.fr/api/mcp`
**Method:** `tools/call` → `get_pricing`

## Input Schema

```json
{
  "type": "object",
  "properties": {}
}
```

## Output

Markdown table with pricing per person for each session duration and player count.

## Pricing

| Duration | 1–2 players | 3–4 players | 5–6 players |
|----------|------------|------------|------------|
| 30 min   | 18 €       | 18 €       | 18 €       |
| 60 min   | 29 €       | 27 €       | 25 €       |

Prices are per person. Same rates for wired (filaire) and wireless (sans_fil) VR.

## Example

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "get_pricing", "arguments": {} }
}
```
