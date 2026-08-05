# ⚡ KSPDB: Automated Grid Fault Localization & AI Dispatch

An event-driven, full-stack telemetry analysis system designed to detect, localize, and manage power grid faults in real-time. 

Unlike traditional CRUD-based ticketing systems, KSPDB operates entirely on simulated IoT telemetry. Tickets are generated, updated, and resolved **automatically** by a background physics analyzer, completely eliminating the need for manual operator intervention.

---

## 🚀 Core Features

*   **Event-Driven Architecture:** Tickets are automatically opened and closed based purely on raw `power_lost` and `power_restored` IoT packets hitting the PostgreSQL database.
*   **Intelligent Noise Filtering:** The system distinguishes between a genuine wire break (Span Fault) and a broken IoT sensor (DT Fault) by verifying the telemetry of downstream nodes.
*   **Spatial Fallback Topology:** KSPDB seamlessly handles the reality of missing infrastructure data. For the 60% of poles lacking explicit parent-child wiring data, the system dynamically calculates a spatial Minimum Spanning Tree (MST) to infer the grid topology.
*   **AI-Powered Dispatch Briefs:** Integrates with an LLM to generate precise, actionable SMS briefs for physical repair crews, detailing coordinates, confidence scores, and affected downstream nodes.
*   **Live Telemetry Dashboard:** A React/Leaflet frontend featuring real-time spatial mapping, dynamic fault lines, and a live terminal feed of the raw hardware ingestion stream.

---

## 🛠️ Tech Stack

**Frontend:**
*   React 18 + Vite
*   TypeScript
*   Tailwind CSS (UI & Styling)
*   React-Leaflet (Spatial Mapping)

**Backend:**
*   Node.js + Express
*   TypeScript
*   Drizzle ORM (Database queries & schema)
*   Custom Physics & Telemetry Simulator Engine

**Infrastructure:**
*   PostgreSQL + PostGIS (Geospatial querying)
*   Docker & Docker Compose (Multi-container orchestration)
*   Nginx (Production frontend serving)

---

## 🐳 Quick Start (Docker)

The entire infrastructure is containerized for seamless evaluation. You do not need Node.js or PostgreSQL installed locally to run this project.

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd kspdb
This is the perfect next step. A strong `README.md` is the "front door" to your project. Since this is an academic and professional submission, the documentation needs to explicitly highlight the complex engineering decisions you made—especially the event-driven architecture and the spatial fallback for missing sensors.

Here is a comprehensive, professional `README.md` template tailored exactly to the architecture we just finalized.

---

```markdown
# ⚡ KSPDB: Automated Grid Fault Localization & AI Dispatch

An event-driven, full-stack telemetry analysis system designed to detect, localize, and manage power grid faults in real-time. 

Unlike traditional CRUD-based ticketing systems, KSPDB operates entirely on simulated IoT telemetry. Tickets are generated, updated, and resolved **automatically** by a background physics analyzer, completely eliminating the need for manual operator intervention.

---

## 🚀 Core Features

*   **Event-Driven Architecture:** Tickets are automatically opened and closed based purely on raw `power_lost` and `power_restored` IoT packets hitting the PostgreSQL database.
*   **Intelligent Noise Filtering:** The system distinguishes between a genuine wire break (Span Fault) and a broken IoT sensor (DT Fault) by verifying the telemetry of downstream nodes.
*   **Spatial Fallback Topology:** KSPDB seamlessly handles the reality of missing infrastructure data. For the 60% of poles lacking explicit parent-child wiring data, the system dynamically calculates a spatial Minimum Spanning Tree (MST) to infer the grid topology.
*   **AI-Powered Dispatch Briefs:** Integrates with an LLM to generate precise, actionable SMS briefs for physical repair crews, detailing coordinates, confidence scores, and affected downstream nodes.
*   **Live Telemetry Dashboard:** A React/Leaflet frontend featuring real-time spatial mapping, dynamic fault lines, and a live terminal feed of the raw hardware ingestion stream.

---

## 🛠️ Tech Stack

**Frontend:**
*   React 18 + Vite
*   TypeScript
*   Tailwind CSS (UI & Styling)
*   React-Leaflet (Spatial Mapping)

**Backend:**
*   Node.js + Express
*   TypeScript
*   Drizzle ORM (Database queries & schema)
*   Custom Physics & Telemetry Simulator Engine

**Infrastructure:**
*   PostgreSQL + PostGIS (Geospatial querying)
*   Docker & Docker Compose (Multi-container orchestration)
*   Nginx (Production frontend serving)

---

## 🐳 Quick Start (Docker)

The entire infrastructure is containerized for seamless evaluation. You do not need Node.js or PostgreSQL installed locally to run this project.

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd kspdb

```

2. **Spin up the containers:**
```bash
docker-compose up -d --build

```


3. **Access the application:**
* **Frontend UI:** `http://localhost:5173`
* **Backend API:** `http://localhost:3000`



*Note: The database container initializes with a health check. The backend will automatically wait for PostgreSQL to be healthy before starting.*

---

## 🎮 Simulation & Evaluation Guide

To evaluate the system's compliance with the event-driven requirement, use the **Simulator Controls** located in the top navigation bar of the UI.

1. **Click `Live Telemetry Link Active**` (Top Right) to open the live ingestion terminal.
2. **Click `⚡ Inject Span Fault**`: The physics engine will simulate a wire break. Downstream sensors will fire `power_lost` packets.
3. **Click `🔍 Force Analyzer Sweep**`: The backend sweep will evaluate the logs, confirm the cascading failure, and **automatically** generate a High/Medium confidence ticket and draw a red fault line on the map.
4. **Click `🔌 Inject DT Fault**`: The engine will simulate a single sensor dying. The analyzer will see downstream sensors are still alive, classify it as a false-positive, and filter it out as noise.
5. **Click `✅ Run Repair Protocol**`: The engine will send `power_restored` packets. The analyzer will sweep the DB and **automatically resolve/close** the ticket, turning the fault line green.

---

## 🧠 Architectural Highlights

**The `hasLiveChild` Logic:**
The core algorithm for fault localization ensures high accuracy even with sparse sensor deployment. When a pole reports dark, the analyzer traverses the spatial tree. It explicitly ignores "dumb" poles (infrastructure without IoT sensors) and only classifies a span as "live" if a verified downstream sensor is transmitting a 4100mV heartbeat.

---

## 👨‍💻 Author

**Ansh Pratap Singh**

```

***

### Next Steps
You can copy this directly into your repository's `README.md` file. It cleanly outlines the problem, the tech stack, the Docker instructions, and most importantly, it tells the grading panel exactly how to test the specific requirements they asked for.

With the documentation and Docker files complete, all that is left is the **Video Demo**. Do you want to go over a quick script/flow for how to record the perfect 2-3 minute presentation?

```