# Deployment & Operations Guide

This document provides step-by-step instructions for deploying, running, and troubleshooting the KSPDB Operations platform using Docker. 

---

## 1. Prerequisites

Ensure you have the following installed on your target machine:
* **Docker** (Engine version 20.10+)
* **Docker Compose** (Version 2.0+)

*No local installations of Node.js, TypeScript, or PostgreSQL are required.*

---

## 2. Environment Variables & Configuration

The application uses environment variables for database connections and runtime configuration. A safe default configuration is embedded within the `docker-compose.yml` file. 

Create a `.env` file in your root project directory if you wish to override default credentials, matching the following structure (`.env.example`):

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://kspdb_admin:kspdb_password@db:5432/kspdb
VITE_API_URL=http://localhost:3000/api

```

---

## 3. Quick Start Deployment

Open your terminal in the root directory of the repository and execute the following command:

```bash
docker compose up -d --build

```

### What happens during startup:

1. **PostgreSQL + PostGIS (`kspdb-db`)** spins up and runs an automated healthcheck (`pg_isready`).


2. Once the database is healthy, the **Backend Service (`kspdb-backend`)** builds, connects to the database, and seeds the synthetic grid network.
3. The **Frontend Service (`kspdb-frontend`)** builds the React application and serves the static production output via Nginx.

---

## 4. Verification

To verify that the system is running correctly:

1. **Frontend UI:** Open your browser and navigate to **`http://localhost:5173`**. You should see the KSPDB Operations dashboard with live metrics and map rendering.


2. **Backend API:** Test the health and ticket endpoint directly at **`http://localhost:3000/api/tickets`**.

---

## 5. Troubleshooting & Common Failure Modes

Listed below are common issues encountered during containerized deployments and their exact resolutions:

### Symptom 1: Port Conflict (Port 5433, 3000, or 5173 already in use)

* **Cause:** Another local service or database instance is occupying the ports mapped in `docker-compose.yml`.
* **Fix:** Stop the conflicting local service or modify the port mappings in your `docker-compose.yml` (e.g., changing `"5173:80"` to `"8080:80"` for the frontend).

### Symptom 2: Database Connection Refused / Backend Crash Loop

* **Cause:** The backend attempted to connect before PostgreSQL completed its initialization sequence.
* **Fix:** The `docker-compose.yml` uses a strict `service_healthy` condition on the database container to prevent this. If overridden, ensure the database container is fully running before starting the backend.



### Symptom 3: Frontend Build Fails with `error TS6133` (Unused Imports)

* **Cause:** TypeScript strict mode treats unused imports in `App.tsx` as fatal build errors during container compilation.
* **Fix:** Ensure all imported icons from `lucide-react` are actively used in the JSX markup, or prune unused imports.

---

## 6. Resetting to a Clean State

If you need to tear down the containers and completely wipe the database volumes to restart with fresh seed data:

```bash
docker compose down -v

```

This safely removes all containers, networks, and persistent PostgreSQL data volumes. You can then run `docker compose up -d --build` again for a fresh start.
