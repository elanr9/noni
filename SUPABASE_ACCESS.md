# Supabase access — never MCP

Noni is project `zdcmmzofnrdqbwexuqnm`.

The workspace Supabase MCP points at FieldVision (`npuhpegvrcwqytsekpag`). **Never use MCP for Noni.** It is a different database and a different token.

## Always do this instead

Load `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` from `.env.local`. Query and mutate through the Management API (or `scripts/apply-migration.ts` / `supabase functions deploy --use-api`).

```bash
set -a && source .env.local && set +a
# SQL
curl -s -X POST "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "User-Agent: supabase-cli/2.75.0" \
  -d '{"query":"select 1"}'
```

Do not paste the token into chat, commits, or this file.
