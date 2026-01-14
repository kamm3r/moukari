# Project Plan: Hammer Throw Analyzer

**Tech Stack:** SvelteKit (SPA/Static), TypeScript, shadcn-svelte, TailwindCSS, OpenCV.js.
**Goal:** Offline-first web app to estimate hammer throw distance from video input.

---

## 📅 Phase 1: Architecture & Setup

**Goal:** Establish the foundation and install libraries.

- [ ] **Scaffolding**
  - [ ] Initialize SvelteKit (`npm create svelte@latest`).
    - [ ] Select: Skeleton Project, TypeScript, Prettier, ESLint, Vitest.
  - [ ] Install Adapter: `npm i -D @sveltejs/adapter-static`.
  - [ ] Configure `svelte.config.js` to use `adapter-static`.

- [ ] **Global Configuration**
  - [ ] Create `src/routes/+layout.ts`.
  - [ ] Set `export const ssr = false;` (Disable Server-Side Rendering).
  - [ ] Set `export const prerender = true;`.

- [ ] **UI Library Setup**
  - [ ] Initialize shadcn-svelte: `npx shadcn-svelte@latest init`.
  - [ ] Install components: `button`, `slider`, `input`, `label`, `card`, `tabs`, `dialog`.
  - [ ] Install OpenCV.js: Add script tag to `src/app.html` or install via npm.

---

## 🧠 Phase 2: State Management (The Brain)

**Goal:** Centralized data store using Svelte 5 Runes.

- [ ] **Create `src/lib/types.ts`**
  - [ ] Define interfaces: `Point`, `TimedPoint`, `AppStep`, `CalculationResult`, `DetectedCircle`, `DetectedHammer`.

- [ ] **Create `src/lib/state.svelte.ts`**
  - [ ] Create `AppState` class.
  - [ ] Implement Video State (`videoUrl`, `currentTime`, `fps`).
  - [ ] Implement Calibration State (`scalePoints`, `realWorldDistance`).
  - [ ] Implement Measurement State (`point1`, `point2`, `groundY`).
  - [ ] Implement Automation Flags (`isProcessing`, `autoDetectedHammer`).
  - [ ] Export global singleton `appState`.

---

## 🔧 Phase 3: The Physics Engine

**Goal:** Accurate math with unit tests.

- [ ] **Create `src/lib/physics.ts`**
  - [ ] Implement `calculateThrowWithDrag`.
  - [ ] Logic:
    - [ ] Calculate pixels-to-meters ratio.
    - [ ] Calculate velocity vectors ($v_x, v_y$).
    - [ ] Implement Step-by-Step Simulation Loop for Drag.
    - [ ] Use Drag Equation: $F_d = 0.5 \cdot \rho \cdot v^2 \cdot C_d \cdot A$.
    - [ ] **CRITICAL:** Set $C_d = 0.62$ (Wire/Handle adjustment).

- [ ] **Testing (`src/lib/physics.test.ts`)**
  - [ ] Write Vitest tests.
  - [ ] Test Kinematics (Velocity/Angle).
  - [ ] Test Drag (Heavy vs Light hammer).
  - [ ] Test Benchmark (Match World Record ~86.74m).

---

## 🤖 Phase 4: Computer Vision (Automation)

**Goal:** Semi-automate the setup process.

- [ ] **Circle Detection (`src/lib/cv/circleDetector.ts`)**
  - [ ] Implement OpenCV Hough Circle Transform.
  - [ ] Return best candidate circle for calibration.

- [ ] **Release Detection (`src/lib/cv/releaseDetector.ts`)**
  - [ ] Implement frame-by-frame motion difference analysis.
  - [ ] Detect motion spike to suggest release frame.

- [ ] **Hammer Detection (`src/lib/cv/hammerDetector.ts`)**
  - [ ] Implement HSV Color Thresholding (or Blob Detection).
  - [ ] Return center coordinates of the hammer ball.

---

## 🖥️ Phase 5: The UI Components

**Goal:** Build the visual interface.

- [ ] **Video Player (`src/lib/components/VideoPlayer.svelte`)**
  - [ ] Render HTML `<video>`.
  - [ ] Render SVG overlay layer (absolute position).
  - [ ] Implement Coordinate Conversion (Mouse/Touch Event $\to$ Video Intrinsic Resolution).
  - [ ] Implement Draggable Markers (Points P1, P2, Calibration).

- [ ] **Main Page (`src/routes/+page.svelte`)**
  - [ ] **Step 0 (Upload):** File Input + FPS Input.
  - [ ] **Step 1 (Calibrate):** Auto-detect button + Manual Slider/SVG interaction.
  - [ ] **Step 2 (Measure):** Frame Scrubber + "Find Release" button + Fine-tune controls.
  - [ ] **Step 3 (Results):** Display Velocity, Angle, Estimated Distance.

---

## 📱 Phase 6: Mobile Polish

**Goal:** Ensure usability on phones.

- [ ] **Touch Handling**
  - [ ] Add `touch-action: none` to SVG layer in `src/app.css`.
  - [ ] Ensure drag logic works with `TouchEvent`.

- [ ] **UX Improvements**
  - [ ] Add "Rotate Phone" banner for portrait mode.
  - [ ] Add "Magnifying Glass" offset for dragging points (prevent fat finger occlusion).
  - [ ] Test on real device.
