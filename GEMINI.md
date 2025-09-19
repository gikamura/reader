# GEMINI Project Context: Gikamura Reader

## Project Overview

This project, named "Gikamura", is a sophisticated, frontend-only Progressive Web App (PWA) for discovering and tracking manga, manhwa, and manhua. It functions as an aggregator, fetching its primary index from a static JSON file hosted on GitHub. The application is designed to be highly performant and resilient, leveraging modern browser APIs to offer an offline-first experience with background data synchronization and native notifications.

The core architecture is built with vanilla JavaScript (ES Modules) and styled with Tailwind CSS (loaded via CDN). It does not use any major JavaScript frameworks like React or Vue.

### Key Features:

*   **PWA Functionality:** Fully installable with offline access thanks to a Service Worker.
*   **Background Sync:** Uses the Periodic Background Sync API to check for content updates even when the app is not open.
*   **Web Workers:** Offloads heavy data processing (fetching and comparing catalog data) to a separate thread to ensure the UI remains responsive.
*   **Client-Side Caching:** Aggressively caches catalog data and user preferences (`favorites`) in `localStorage` to minimize network requests and enable offline use.
*   **State Management:** Implements a simple, centralized state management pattern in `store.js`.
*   **Data Source:** Fetches chapter information by decoding `cubari.moe/read/gist/` URLs, which point to underlying JSON files on GitHub.

## Building and Running

This is a static web project with **no build step**.

### Running Locally

1.  You need a local web server to serve the files.
2.  Make sure you are in the project's root directory.
3.  Run one of the following commands:
    *   **Using Python:** `python3 -m http.server`
    *   **Using Node.js:** `npx serve`
4.  Open your browser and navigate to the local address provided by the server (e.g., `http://localhost:8000`).

**Note:** Full PWA functionality, including the Service Worker and notifications, requires the site to be served over **HTTPS** or on `localhost`.

### Deployment

The project is configured for continuous deployment to GitHub Pages. Any push to the `main` branch will automatically trigger a deployment. The workflow simply uploads the entire repository as a static artifact.

## Development Conventions

*   **Modularity:** The codebase is organized into modules based on their functionality:
    *   `app.js`: Main application entry point and orchestrator.
    *   `api.js`: Handles all external data fetching and processing.
    *   `store.js`: Centralized state management.
    *   `ui.js`: DOM manipulation and rendering logic.
    *   `cache.js`: Abstraction layer for `localStorage`.
    *   `sw.js`: The Service Worker for background tasks and caching.
    *   `update-worker.js`: The Web Worker for heavy processing.
*   **State Flow:**
    1.  Actions (e.g., user clicks) are dispatched to the `store`.
    2.  The `store` updates its internal state.
    3.  A `subscribe` mechanism calls the `renderApp` function in `ui.js` to update the DOM based on the new state.
*   **No Dependencies:** The project uses no external npm packages. All code is vanilla JavaScript, and Tailwind CSS is included via a CDN.
*   **Testing:** There is no automated testing suite configured for this project. Code quality is enforced in the CI pipeline by validating JavaScript syntax (`node -c`) and the `manifest.json` format.
