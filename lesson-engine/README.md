# lesson-engine

Renderer-agnostic **general state machine** for compiled lesson plans.

- **Architecture (read this first):** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **JavaScript runtime:** [runtime.js](./runtime.js) — `LessonRuntime` class
- **Example plan:** [examples/reflectance_albedo.json](./examples/reflectance_albedo.json)

This package is **independent** of ActiveReader. ActiveReader uses a separate event-driven tutor (`active-reader-platform/frontend/src/activeReaderStateMachine.js`).

Python source (`lesson_engine/*.py`) was deleted; bytecode remains in `lesson_engine/__pycache__/` for recovery. See ARCHITECTURE.md §15–§19.
