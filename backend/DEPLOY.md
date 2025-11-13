## Deploy checklist (backend)

Steps to make the backend run with a real MySQL database (safe, repeatable):

1. Provision a MySQL database (managed provider or VPS).
   - Create a non-root user and password for the app.
   - Whitelist the application host IP (or use a managed DB with network integrations).

2. Set environment variables on the host/CI (do NOT commit these):
   - `DB_HOST` (e.g. `db.example.com`)
   - `DB_PORT` (default `3306`)
   - `DB_USER` (app DB user)
   - `DB_PASSWORD` (secure password)
   - `DB_NAME` (database name)
   - `DB_SSL` (`true` if provider requires SSL)
   - `PORT` (optional, default 3000)

3. Run a DB connectivity check (recommended before deploy):

   On the host or CI runner, in the project `backend` folder:

   ```powershell
   node scripts/check_db.js
   ```

   - Exit code `0` → DB reachable.
   - Non-zero → fix credentials/network before deploying.

4. Initialize database schema (one-time):
   - The server attempts `initDb()` on startup. Alternatively, run migrations manually by calling the exported `initDb` from a small script or run the server once after env is configured.

5. Deploy options:
   - Docker: build `backend/Dockerfile` and run container with env variables.
   - Platform (Render/Heroku/Railway): configure environment variables and set startup command `node server.js`.

6. Verify endpoints after deploy:
   - `GET /health`
   - `GET /tables`
   - `POST /storage/test_key` and `GET /storage/test_key` (should persist to DB if available; otherwise stored in fallback file)

Notes:
 - We added a filesystem fallback `backend/data/client_storage.json` so the app works offline if DB auth fails. For the cloud deploy make sure DB credentials are correct to use central storage.
 - Do not use `root` as the app user in production.
