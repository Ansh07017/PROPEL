# Architecture & Technical Design

This document details the system design, data flow, ingestion strategy, fault localization algorithms, and architectural trade-offs implemented for the KSPDB Operations platform.

---

## 1. System Architecture & Data Flow

The platform follows a decoupled client-server architecture backed by a spatial relational database, designed to process high-frequency IoT telemetry and automatically manage the fault lifecycle without human intervention.

```markdown
# Architecture & Technical Design

This document details the system design, data flow, ingestion strategy, fault localization algorithms, and architectural trade-offs implemented for the KSPDB Operations platform.

---

## 1. System Architecture & Data Flow

The platform follows a decoupled client-server architecture backed by a spatial relational database, designed to process high-frequency IoT telemetry and automatically manage the fault lifecycle without human intervention.


```

    [ Pole IoT Devices / Simulator ]
       (HTTP Push: /api/telemetry)
                 |
                 ▼
┌────────────────────────────────────────┐
│         Node.js / Express API          │
│  - Ingestion & De-duplication Engine   │
│  - Background Fault Analyzer Sweep     │
└──────────────────┬─────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌─────────────────┐ ┌─────────────────┐
│ PostgreSQL DB   │ │   AI Service    │
│ (Drizzle ORM &  │ │ (LLM Dispatch   │
│  Spatial Data)  │ │  Brief Gen)     │
└─────────────────┘ └─────────────────┘
                   ▲
   |
┌──────────────────┴─────────────────────┐
│          React / Vite UI               │
│  - Real-time Leaflet Spatial Map       │
│  - Active/Closed Ticket Workflow       │
│  - Live Telemetry Ingestion Stream     │
└────────────────────────────────────────┘
            (REST / JSON)  
```

---

## 2. Data Sourcing and Ingestion

### Ingestion Strategy
Pole devices push telemetry events to the Express backend (`/api/telemetry`). To handle network retries, out-of-order deliveries, and bursts, the ingestion pipeline implements strict de-duplication:
* **Sequence Monotonicity (`seq`):** Each device tracks a monotonic sequence number that resets only on a `boot` event. This acts as the source of truth for ordering and discarding duplicate payloads.
* **Clock Skew Mitigation:** Device clocks can exhibit skew up to $\pm 90$ seconds[cite: 4]. The backend relies on ingestion server timestamps coupled with the device's monotonic `seq` rather than trusting absolute device timestamps for event sequencing.
* **Burst Handling:** The database and ingestion layer handle high-frequency reporting blocks seamlessly through connection pooling, sustaining nominal state updates while keeping latency under control.

---

## 3. Storage and Internal Model

The system uses **PostgreSQL** with Drizzle ORM. 

### Core Schemas:
1. **`poles` Table:** Stores asset metadata including `pole_id`, GPS coordinates (`lat`, `lon`), feeder association (`feeder_id`), distribution transformer association (`dt_id`), lineage placement (`parent_pole_id`), and associated IoT hardware (`device_id`).
2. **`telemetry_logs` Table:** Append-only log table recording every incoming packet (`device_id`, `energized`, `event`, `battery_mv`, `rssi`, `ts`, `seq`).
3. **`tickets` Table:** Tracks the lifecycle of detected faults (`ticket_id`, `dt_id`, `affected_span_start`, `affected_span_end`, `status`, `confidence`, `downstreamCount`, timestamps).

---

## 4. The Fault Localization Algorithm

The core algorithmic challenge is converting node-level observations into edge-level (span) localization, particularly given that **60% of distribution transformers lack recorded pole ordering (`seq_on_line` and `parent_pole_id`)**[cite: 4].

### A. Graph & Topology Construction
* **With Explicit Topology (40% case):** The system builds an exact directed tree structure from `parent_pole_id` relationships.
* **Spatial Minimum Spanning Tree (MST) Fallback (60% case):** For legacy transformers lacking explicit wiring data, the engine programmatically infers a radial tree. It starts at the Distribution Transformer's coordinates as the root, iteratively connecting unassigned poles to the nearest already-assigned spatial node using Haversine distance. Confidence for these tickets is explicitly tagged as `Medium` (whereas exact topology yields `High` confidence).

### B. Finding the Boundary & Noise Filtering
1. **State Aggregation:** The analyzer queries the latest state of all devices, identifying currently dark poles (`energized: false`).
2. **The "Dumb Pole" Guard (`hasLiveChild`):** To prevent false positives caused by infrastructure lacking IoT sensors (~9% of poles have no device)[cite: 4] or dead modems, the tree traversal algorithm checks downstream descendants. A pole is only evaluated if it possesses active hardware. If a dark pole has a verified sensor-equipped child that is still reporting live, the node is flagged as a dead sensor/noise and ignored.
3. **Span Isolation:** When a genuine span fault occurs, the algorithm identifies the boundary between the last live parent and the first dark child, creating a single unified incident ticket containing the downstream affected count.

### C. Automatic Resolution (Closed Loop)
Background sweeps continuously cross-reference open tickets against live incoming telemetry. When `power_restored` packets arrive for the affected span end-pole, the system automatically transitions the ticket status to `closed` with a verifiable `resolvedAt` timestamp.

---

## 5. Noise Handling

* **Scheduled Outages:** The analyzer queries an active scheduled maintenance and load shedding endpoint before evaluating faults. If a target DT or Feeder matches an active planned outage window, fault generation is suppressed.
* **Firmware 1.2 Devices:** Recognizes that older firmware versions go silent instead of sending explicit `power_lost` gasps, handling timeouts gracefully alongside capacitor-backed reserve failures.

---

## 6. API Surface

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/tickets` | `GET` | Fetches active and closed fault tickets. |
| `/api/stats` | `GET` | Retrieves real-time grid metrics (Total poles, DTs, energized count, topology ratios). |
| `/api/logs` | `GET` | Pulls recent raw telemetry payloads for the UI ingestion modal. |
| `/api/simulate` | `POST` | Triggers physics-based fault injections (span fault, DT fault, repair protocol). |
| `/api/analyzer/run` | `POST` | Forces an immediate fault-detection and resolution analyzer sweep. |
| `/api/ai/dispatch` | `POST` | Generates an AI-powered SMS brief for field crews based on fault parameters. |

---

## 7. Operator Experience (UI Reasoning)

The UI is optimized for a control room operator working under high-pressure conditions:
* **Information Hierarchy:** Active faults dominate the primary view with clear confidence indicators, exact span definitions, and downstream impact numbers.
* **Spatial Context:** Selecting a ticket immediately commands the Leaflet map to fly to coordinates at high zoom, rendering a clear visual vector line across the exact failed span.
* **Live Ingestion Feed:** A dedicated terminal modal allows operators to audit live hardware packets instantly, bridging the gap between automated software decisions and transparent raw data.

---

## 8. AI Feature Integration

* **Feature:** AI-Powered Dispatch Brief Generator.
* **Placement:** Positioned within selected open tickets via the "Draft Dispatch Brief" action.
* **Justification:** LLMs excel at summarization and natural language formatting. Instead of forcing operators to read raw coordinate matrices and technical node IDs, the AI translates structured fault data into a concise, professional SMS brief tailored for field crews. 
* **Fallback:** If the AI service is unavailable, the system safely degrades by displaying core structured metadata directly.

```