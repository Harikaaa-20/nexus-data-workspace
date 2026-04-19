# Nexus Data 📊
**Real-time Collaborative AI Data Workspace**

Nexus Data is a full-stack, real-time multiplayer data analysis workspace. It is designed to act as a "Figma for Data Science," helping remote teams visualize complex datasets together simultaneously. 

It combines synchronized live cursors with a custom-engineered Natural Language Processing (NLP) engine capable of aggregating spreadsheets and generating dynamic graphical charts—all without relying on expensive external LLM API keys.

---

## ✨ Enterprise-Grade Features

* **Multiplayer Live Collaboration:** Bi-directional WebSockets (`Socket.io`) stream mouse movements, chat payloads, and visual updates to all users in a workspace within milliseconds.
* **Secure Room Sandboxing:** Cryptographically generated URL parameters (e.g. `?room=8f9b2c`) automatically quarantine chat channels, datasets, and cursor streams to ensure absolute privacy between different organizations.
* **Deterministic NLP Engine:** A lightweight, custom-built parsing algorithm mathematically infers user intent. It dynamically handles complex filtering (e.g., *"Show the **average** total revenue by region **where** channel is online"*) and renders Bar, Line, or Pie charts based on language context.
* **Database State Persistence:** A headless `SQLite` backend ensures datasets, chat history arrays, and room states are seamlessly recovered upon server initialization.
* **Comprehensive Export Pipeline:** Team members can download chart-specific `CSV` aggregations or capture high-fidelity `PNG` snapshots of the entire graphical glassmorphism canvas.

---

## 🛠 Tech Stack Component Architecture

### Frontend Architecture
* **React 18** (`Vite` configuration)
* **Recharts:** Enterprise data visualization component library.
* **Socket.io-client:** Bi-directional websocket polling.
* **Lucide-React:** Lightweight vector iconography.
* **Glassmorphism CSS:** Advanced UI/UX implementing CSS variables, backdrop blurs, and animated layout flexboxes.

### Backend Architecture
* **Node.js / Express:** High-performance REST architecture.
* **Socket.io:** Event-driven multi-player server mapping.
* **SQLite3:** Relational database management.
* **Multer / CSV-Parser:** High-throughput `fs` stream ingestion for large datasets.

---

## 🚀 Quick Setup Instructions

1. Clone this repository to your local machine.
2. Ensure you have Node.js installed. In the root directory, install concurrency dependencies:
   ```bash
   npm install concurrently -g
   ```
3. Navigate into the directories and install absolute dependencies:
   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```
4. Return to the root folder, and initialize both the Node Backend and React Frontend concurrently:
   ```bash
   npm start
   ```
5. Navigate to `http://localhost:5173` to automatically generate a secure workspace and begin collaborating.

---

## 📸 Screenshots & Usage

**1. The Analytics Live Canvas**
Upload raw CSV files via the secure sidebar panel. As you query the AI Data Assistant, rendered HTML5 charts will broadcast directly into your active dashboard tabs.

**2. Figma-Style Presence**
Share your URL Invite link with your team. Instantly see their named cursors hovering over the data canvas, drastically reducing friction during remote analysis presentations.
