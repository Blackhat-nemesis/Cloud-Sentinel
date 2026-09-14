# CloudSentinel

CloudSentinel is a FinOps security dashboard for detecting cloud-cost velocity anomalies and suspicious GPU provisioning. It supports a safe simulation mode and read-only AWS EC2 inventory analysis.

> **Safety:** all price and financial-exposure values are estimates. Containment in this hackathon build is simulated in the application database; it does not stop EC2 instances or revoke IAM credentials. Real AWS secrets are never sent to, stored in, or built into the frontend.

## Deployment architecture

```text
Browser
  │ HTTPS + Socket.IO
  ▼
Vercel — React / Vite frontend
  │ VITE_API_URL (public backend URL)
  ▼
Render — Express / Socket.IO backend ──► AWS EC2 read-only Describe APIs
  │
  └── Render Postgres database
```

## Local development

Requirements: Node.js 18+ and npm.

```bash
# Backend
cd backend
copy .env.example .env
npm ci
npx prisma generate
npx prisma db push
npm run dev

# Frontend (second terminal)
cd frontend
copy .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5173`. The backend health endpoint is `http://localhost:3001/health`.

## Deploy backend to Render

1. Push this project to a private GitHub repository. Do not commit any `.env` file or database file.
2. In Render, choose **New + → Blueprint** and select the repository. The included [`render.yaml`](render.yaml) provisions both the `cloud-sentinel-api` service and `cloud-sentinel-db` PostgreSQL database.
3. Both resources are explicitly configured for Render's **Free** plan. No persistent disk or paid plan is required.
4. In the service's Environment settings, set:

   ```text
   FRONTEND_ORIGIN=https://your-project.vercel.app
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_DEFAULT_REGION=ap-south-1
   LIVE_CONTAINMENT_ENABLED=false
   ```

   `DATABASE_URL` is wired automatically from Render Postgres by the Blueprint—do not enter it manually. `AWS_SESSION_TOKEN` is optional and should be set only for temporary AWS credentials. Render already sets the port; never add AWS variables in Vercel.
5. Deploy and open `https://your-render-service.onrender.com/health`. It must return `{"status":"ok", ...}` before deploying the frontend.

For least privilege, give the AWS IAM principal only `ec2:DescribeInstances` and `ec2:DescribeRegions` for the demo account. The application does not call any write or termination API.

## Deploy frontend to Vercel

1. Import the same repository in Vercel.
2. Set **Root Directory** to `frontend`.
3. Set the Production environment variable:

   ```text
   VITE_API_URL=https://your-render-service.onrender.com
   ```

   This is intentionally public because the browser needs to call the API. Do not configure any AWS variable here.
4. Deploy. Copy the generated Vercel URL and update the Render `FRONTEND_ORIGIN` value to that exact URL, then redeploy Render.
5. Verify browser requests, Socket.IO updates, simulation controls, and `/health` from the final URLs.

If you add a custom frontend domain, append it to `FRONTEND_ORIGIN` as a comma-separated value and redeploy the backend.

## Production configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | Vercel only | Public backend base URL, embedded during frontend build. |
| `FRONTEND_ORIGIN` | Render only | Exact allowed Vercel URL(s) for REST and Socket.IO CORS. |
| `DATABASE_URL` | Render | PostgreSQL connection string injected automatically by `render.yaml`. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Render only | Backend AWS credential provider chain. |
| `AWS_DEFAULT_REGION` | Render only | Default AWS region (`ap-south-1`). |
| `LIVE_CONTAINMENT_ENABLED` | Render only | Explicitly false; live containment is disabled. |

## Deployment checks

- `GET /health` returns HTTP 200.
- An origin other than `FRONTEND_ORIGIN` is blocked by CORS.
- Invalid mutation payloads return HTTP 400.
- Quarantine requires an explicit confirmation and writes only a simulated containment audit record.
- Simulation and live AWS analysis remain separate; live analysis only reads EC2 inventory.
- Build checks: `cd backend && npm run build`, then `cd frontend && npm run build`.

## Project layout

- `frontend/` — Vite React dashboard. API endpoint comes from `VITE_API_URL`.
- `backend/` — Express, Socket.IO, Prisma, simulation engine, and read-only AWS EC2 analysis.
- `backend/prisma/` — PostgreSQL schema. The database is a separate free Render service, not a local file.

## Future production work

For a full SaaS deployment, add authentication and tenant isolation, use CloudWatch/CloudTrail ingestion, and add guarded human-approved containment workflows. Render's free Postgres tier is suitable for a hackathon demo but expires after 30 days; move to a paid database before relying on it long-term.
