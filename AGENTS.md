# AI Agent Guidelines & Project Architecture

> **NOTICE TO AI AGENTS:** Read this file before making any changes. This project follows strict physics and architectural rules. Do not halllucinate dependencies or break the "Offline First" principle.

---

## 1. Project Identity

**Name:** Hammer Throw Video Analyzer
**Type:** Offline-first Single Page Application (SPA) for indoor/outdoor athletics training.
**Core Function:** Estimates hammer throw distance from video input using kinematic physics and computer vision.

---

## 2. Tech Stack (Strict)

- **Framework:** SvelteKit (Svelte 5 Runes syntax `state`, `derived`, etc.).
- **Language:** TypeScript (Strict mode).
- **Styling:** TailwindCSS.
- **UI Components:** shadcn-svelte (Bits UI).
- **Computer Vision:** OpenCV.js (loaded via CDN or local vendor file).
- **Testing:** Vitest (Unit tests for physics engine).
- **Deployment:** Static Adapter (`adapter-static`). **NO NODE.JS RUNTIME.**

---

## 3. Architectural Rules

### A. The "Offline First" Rule

- **Constraint:** The app must run entirely in the browser (client-side).
- **Forbidden:** Do not use SvelteKit server actions (`+page.server.ts`), server-side API routes, or database calls.
- **Video Handling:** Use `URL.createObjectURL(file)` (Blob API). Never try to upload files to a server.
- **Config:** `src/routes/+layout.ts` must always contain `export const ssr = false;`.

### B. State Management (Svelte 5)

- **Global State:** Use the singleton pattern in `src/lib/state.svelte.ts`.
- **Syntax:** Use Svelte 5 Runes (`$state`, `$derived`, `$effect`).
- **Legacy Ban:** Do NOT use Svelte 4 stores (`writable`, `readable`) unless absolutely necessary for library compatibility.

### C. Physics Engine Integrity

- **Location:** `src/lib/physics.ts`.
- **Testing:** ANY change to the physics math must be verified by running `npm test`.
- **Drag Coefficient:** The `DRAG_COEFFICIENT` is tuned to **0.62** (not the standard sphere 0.47) to account for wire/handle parasitic drag. **DO NOT CHANGE THIS VALUE** without citing a biomechanics source.
- **Inputs:** Calculations must account for `mass` (kg) and `diameter` (mm).

---

## 4. Coding Conventions

### Video & Canvas

- **Coordinate System:** The SVG overlay and Canvas CV logic must explicitly handle the scaling ratio between `video.videoWidth` (intrinsic) and `getBoundingClientRect()` (CSS size).
- **Mobile Touch:** All canvas/SVG interactions must support both `MouseEvent` and `TouchEvent`.
- **CSS:** Use `touch-action: none` on interactive elements to prevent scrolling while dragging points.

### Computer Vision (OpenCV.js)

- **Loading:** OpenCV is loaded asynchronously. Always check `if (cv && cv.Mat)` before running CV functions.
- **Memory Management:** **CRITICAL:** Every `new cv.Mat()` must be deleted manually (`mat.delete()`) in a `finally` block to prevent memory leaks. JavaScript garbage collection does NOT clean up OpenCV C++ memory.

---

## 5. File Structure

- `src/lib/physics.ts`: Pure math functions (testable).
- `src/lib/cv/`: Computer vision logic (circle detection, motion tracking).
- `src/lib/state.svelte.ts`: Global application state.
- `src/lib/components/`: Reusable UI (VideoPlayer, etc.).
- `src/routes/`: Pages (SvelteKit routing).

---

## 6. Common Pitfalls (Do Not Repeat)

1.  **SSR Errors:** Do not access `window` or `document` in the script root. Put browser-only code inside `onMount` or `$effect`.
2.  **Video Scrubber:** The HTML `<input type="range">` value is an integer (frame number). Always convert to float (seconds) before setting `video.currentTime`.
3.  **Hammer Weight:** Do not assume a vacuum. Always apply drag physics based on the implement type (Men's 7.26kg vs Women's 4kg).
