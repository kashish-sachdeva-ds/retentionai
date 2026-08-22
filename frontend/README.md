# RetentionAI web client

The React client is the primary interactive UI for this portfolio. Requests
flow through `/api`, so the browser does not need direct access to the API
container.

```powershell
cd frontend
npm ci
npm run dev
```

Start the API and Redis services first (`docker compose up api redis`), or run
the complete stack using `docker compose up --build`. The client is available
at `http://localhost:3000`; the Streamlit evidence dashboard is still served
at `http://localhost:8501`.

For separately hosted development APIs, set `VITE_API_BASE_URL` before
starting Vite. Prefer the built-in same-origin proxy for deployment so CORS
does not become part of the app's runtime configuration.
