# Shared saves server (one-time setup, about 3 minutes, free)

1. Make a free account at https://dash.cloudflare.com/sign-up (no card needed).
2. Install Node.js, then in this folder run:
   - `npx wrangler login`
   - `npx wrangler kv namespace create SAVES`  (copy the printed id into `wrangler.toml`)
   - `npx wrangler deploy`
3. Wrangler prints an address like `https://nebulator-saves.yourname.workers.dev`.
   Paste it into NEBULATOR: Co-op > Shared saves > Server address. Only the person who creates saves needs to; friends
   paste the same address and then the save's code.

Limits on the free plan: 1000 uploads per day in total and 20 MB per save (each upload counts twice because the previous
version is kept). Anyone with a save's code can read and overwrite it, so only give codes to friends.
