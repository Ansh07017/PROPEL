```markdown
# Decisions Log

This document logs significant architectural, technical, and product decisions made during the development of the KSPDB Operations platform, listed in reverse chronological order.

---

### 1. Implementation of a Spatial Minimum Spanning Tree (MST) Fallback
* **Context:** Approximately 60% of distribution transformers lack recorded pole ordering (`seq_on_line` and `parent_pole_id`)[cite: 4].
* **Choice Made:** Implemented a spatial MST fallback algorithm that programmatically infers a radial tree starting from the Distribution Transformer's coordinates as the root and linking unassigned poles based on Haversine distance.
* **Rejected Alternative:** Forcing a hard requirement on manual asset registry entry or ignoring transformers missing topology data.
* **Rationale:** Since the 60% missing topology condition is a core domain constraint of the problem statement[cite: 4], the system must still provide actionable intelligence rather than failing entirely. Tagging these inferred tickets with `Medium` confidence preserves transparency for operators.

### 2. Event-Driven Resolution Over Manual UI Closures
* **Context:** The department needed assurance that tickets are closed based on reality rather than human error or complacency.
* **Choice Made:** Enforced a strict rule where ticket resolution and closure occur exclusively through automated telemetry verification (`power_restored` packets from the field)[cite: 3].
* **Rejected Alternative:** Allowing operators or field crews to manually click a "Resolve" button to clear tickets.
* **Rationale:** Manual closures lead to stale data and human error (e.g., marking a line fixed while poles are still dark)[cite: 3]. Automated closure guarantees that the system accurately mirrors physical field states.

### 3. Utilization of PostgreSQL with Drizzle ORM
* **Context:** Needed a reliable, performant storage layer capable of handling relational pole/transformer metadata alongside append-only high-frequency telemetry logs.
* **Choice Made:** PostgreSQL paired with Drizzle ORM.
* **Rejected Alternative:** NoSQL document stores (e.g., MongoDB) or heavy ORMs like Prisma.
* **Rationale:** Relational integrity is vital for tracking strict lineage, feeders, and transformer relationships. Drizzle provides lightweight, type-safe queries without massive performance overhead, keeping container builds fast and clean.

### 4. Client-Side Spatial Rendering via React-Leaflet
* **Context:** The control room operator requires an intuitive spatial map to visualize faults and coordinates instantly[cite: 3].
* **Choice Made:** Integrated React-Leaflet with OpenStreetMap tiles.
* **Rejected Alternative:** Building a custom canvas-based renderer or using paid/keyed mapping solutions (e.g., Mapbox).
* **Rationale:** Leaflet is lightweight, mature, requires no paid API keys for base tiles, and runs seamlessly inside a production Nginx container without failing evaluation gates[cite: 5].

### 5. Dockerized Multi-Container Orchestration
* **Context:** Evaluators need to run the entire system instantly with a single command on a clean machine[cite: 5].
* **Choice Made:** Created a master `docker-compose.yml` orchestrating PostgreSQL, the Node.js backend, and the Nginx-served React frontend.
* **Rejected Alternative:** Providing raw startup scripts or expecting local Node/Postgres installations.
* **Rationale:** Eliminates environmental discrepancies (Node versions, OS differences) and satisfies the critical one-command evaluation gate (`docker compose up`)[cite: 5].

---

## Assumptions & Ambiguities Log
* **Assumption on Device Identification:** We assumed that `pole_id` remains stable even if physical IoT hardware (`device_id`) is swapped out during maintenance[cite: 4].
* **Assumption on Telemetry Ingestion Rate:** We designed the ingestion endpoint to handle steady state combined with burst traffic gracefully, prioritizing monotonic sequence numbers (`seq`) over device timestamp monotonicity due to clock skews ($\pm 90$s)[cite: 4].

---

## Current Known Limitations & Fragilities
* **Geocoding Dependency:** PIN code lookups rely on internal registry data; missing entries fallback gracefully but lack dynamic external reverse-geocoding fallback without internet access.
* **Synthetic Scale:** The simulation runs smoothly on a representative subset of the subdivision's poles rather than all 38,400 assets simultaneously to preserve local developer machine memory constraints[cite: 4].

---

## What We Would Do With Two More Weeks
1. **WebSocket Integration:** Replace polling intervals with robust WebSocket streaming for real-time telemetry updates.
2. **Historical Analytics:** Implement aggregated uptime/downtime metrics per feeder to assist engineers with long-term capital planning.
3. **Automated Unit Test Suite:** Expand automated testing coverage specifically around edge cases in the spatial MST fallback and multi-fault boundary detection.

```