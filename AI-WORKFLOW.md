# AI Workflow & Collaboration Log

This document outlines how AI tools were utilized during the development of the KSPDB Operations platform, detailing what was delegated, where the AI failed, and the prompt engineering strategies used to overcome complex architectural constraints[cite: 5].

## 🛠️ Tools Used
*   **Google Gemini:** Used as the primary pair-programming assistant, architectural sounding board, and boilerplate generator.
*   **GitHub Copilot:** Used in-IDE for autocomplete, syntax formatting, and repetitive Drizzle ORM schema mapping.

## ⚖️ Delegation Strategy: What I Let AI Write vs. What I Wrote

**What I Delegated Wholesale:**
*   **Boilerplate & Configuration:** I delegated the creation of the multi-stage `Dockerfile`, `docker-compose.yml`, and initial Express.js server scaffolding[cite: 5]. AI is exceptionally good at writing standard infrastructure code.
*   **UI Layout & Tailwind Styling:** I instructed the AI to generate the React/Leaflet dashboard layout and apply Tailwind utility classes. Writing CSS grids and flexbox layouts by hand is time-consuming, and AI drastically accelerated the prototyping phase.

**What I Wrote / Heavily Supervised:**
*   **The Physics Simulator:** The assignment required simulating realistic device behaviors, including capacitor-backed dying gasps, 9% of poles lacking sensors, and firmware 1.2 devices going silent[cite: 4]. I mapped out this state machine manually to ensure it respected the physical constraints of the grid before letting the AI draft the syntax.
*   **The Analyzer Algorithm (Fault Localization):** Because fault localization accounts for a major portion of the evaluation criteria[cite: 6], I did not let the LLM blindly generate a solution. I designed the spatial Minimum Spanning Tree (MST) approach to handle the 60% of DTs missing topology[cite: 4], and iteratively guided the AI to implement the specific `hasLiveChild` tree-traversal logic. 

## 🚨 Where the AI Failed (And How I Caught It)

Language models struggle with implicit domain constraints. Here are three concrete instances where the AI confidently produced broken or misleading code, and how I resolved them[cite: 5]:

### 1. The "Dumb Pole" Noise Filter Trap
*   **The Error:** During Phase 2 of the analyzer algorithm, the AI wrote a loop to check if a dark pole had any "live" children. Its logic was: *If a child pole is NOT in the `darkPoleIds` array, it must be energized.*
*   **The Catch:** I injected a span fault using the simulator, but no ticket was generated[cite: 5]. I realized the AI forgot a critical constraint: **9% of poles have no IoT devices installed**[cite: 4]. A pole without a sensor will *never* report being dark. The AI was looking at "dumb" poles, assuming they were live, and filtering out genuine span faults as noise.
*   **The Fix:** I rewrote the condition to explicitly check for hardware presence: `if (childPole && childPole.deviceId && !darkPoleIds.has(childId))`. 

### 2. Leaflet Map z-index Swallowing the UI
*   **The Error:** When adding a raw telemetry logs modal over the dashboard, the AI suggested standard Tailwind classes: `absolute inset-0 z-50`. 
*   **The Catch:** Upon clicking the telemetry button, the screen dimmed, but the modal was invisible. I knew that Leaflet maps use aggressively high internal `z-index` values for their tile panes (up to 1000). 
*   **The Fix:** I moved the modal to the very bottom of the React DOM hierarchy and forced a `z-[9999]` class to override the mapping library.

### 3. Strict Mode Docker Build Crashes
*   **The Error:** The AI generated my frontend `Dockerfile` to use `tsc -b && vite build`[cite: 5]. 
*   **The Catch:** The Docker container failed to build on the final step. I checked the build logs and saw `error TS6133`. The AI had imported several Lucide React icons (like `MapPin` and `ChevronRight`) during an earlier brainstorming phase but never actually used them in the JSX. TypeScript's strict mode treated these unused imports as fatal errors during the production build.
*   **The Fix:** I manually pruned the unused imports from `App.tsx` and rebuilt the container successfully.

## 📊 AI Contribution Estimate
Roughly **60%** of the raw lines of code in this repository were AI-generated[cite: 5] (primarily frontend components, styling, and database CRUD operations). The remaining **40%**—including the core radial tree traversal, physics simulation, and data structures—was manually authored or strictly refactored by me to meet the domain constraints.

## 💬 Best Prompt / Session Excerpt
The most critical part of this build was handling the missing wiring topology[cite: 4]. Below is the conceptual prompt I used to successfully guide the AI toward the spatial fallback architecture:

> *"I am building a fault localization engine for a radial low-tension power grid. I have an array of dark poles, but for 60% of the transformers, I do not have `parent_pole_id` or `seq_on_line` data. I only have exact lat/lon coordinates. I need to write an algorithm that dynamically builds a spatial Minimum Spanning Tree (MST). Start at the transformer's coordinates as the root, and iteratively link the closest unassigned pole to the nearest already-assigned pole. Do not write the full application; just give me the TypeScript function that takes an array of poles and returns a `Map<string, string[]>` representing the parent-to-children tree."*

---
**Author:** Ansh Pratap Singh