# Figure Platform

This branch is the **Claude Code agent generator testing branch** for the figure
platform. It keeps the existing figure pipeline, but adds an opt-in Claude coding-agent
generator for the generation stage.

Pipeline shape:

```text
planner -> Claude Code generator -> verifier/critic -> orchestrator/refine loop
```

The previous generator made a direct model call to produce HTML/Three.js. In this branch,
`GENERATOR_MODE=agent` replaces that generator with a bounded Claude Agent SDK loop. The
agent writes code, renders it in a headless browser through an in-process `render_figure`
tool, reads verifier feedback plus a screenshot, repairs the code, and returns the final
HTML.

For the full branch notes, see `backend/AGENTIC_GENERATOR.md`.

## What This Branch Adds

- Claude Code agent generator for 3D figures: `backend/generation-agent.js`
- Claude Code agent generator for 2D standalone demos: `backend/generation-2d-agent.js`
- Rendered verification gates before critic calls: `backend/verify.js`, `backend/verify-2d.js`
- Timing logs for plan, generation, verification, critic, orchestrator, and agent render turns
- Batch runners for 3D benchmark, 3D standalone demos, and 2D demos
- Local HTML galleries for inspecting generated outputs

Generated batch outputs and galleries are intentionally not committed to git. They are
created locally under folders like `backend/agent_batch_out/`,
`backend/agent_2d_batch_out/`, and `backend/agent_3d_demo_out/`.

## Quick Start

### 1. Install dependencies

```bash
cd figure-platform/backend
npm install
```

### 2. Set API keys

The Claude Code generator uses `ANTHROPIC_API_KEY`:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Planner and critic still use the existing provider setup in `backend/models.js`, so keep
the existing OpenAI/Gemini/Anthropic keys needed by the rest of the pipeline.

### 3. Test one agentic figure

```bash
cd figure-platform/backend
GENERATOR_MODE=agent node test_agent_figure.js
```

Useful generator controls:

```bash
export GENERATOR_MODE=agent
export AGENT_GEN_MODEL=sonnet
export AGENT_GEN_EFFORT=low
export AGENT_GEN_THINKING_TOKENS=4096
export AGENT_GEN_MAX_TURNS=8
export AGENT_GEN_TIMEOUT_MS=300000
```

## Run 3D Benchmark Batch

```bash
cd figure-platform/backend
GENERATOR_MODE=agent TEST_MAX_ATTEMPTS=2 node batch_benchmark.js
```

Outputs:

```text
figure-platform/backend/agent_batch_out/
```

Open the gallery through a local HTTP server:

```bash
cd figure-platform/backend/agent_batch_out
python3 -m http.server 8976
```

Then visit:

```text
http://127.0.0.1:8976/gallery.html
```

Do not open generated HTML with `file://`; Chrome can block those files. Use the local
server URL.

## Run 2D Demo Batch

```bash
cd figure-platform/backend
node batch_2d_demos.js
```

Serve the 2D gallery:

```bash
cd figure-platform/backend/agent_2d_batch_out
python3 -m http.server 8977
```

Open:

```text
http://127.0.0.1:8977/gallery.html
```

## How It Works

1. Planner extracts the figure structure and intended interaction.
2. Claude Code agent generator writes the interactive HTML/Three.js payload.
3. The render tool runs the result in a real browser and returns verification errors plus a screenshot.
4. The agent repairs mechanical issues before the outer critic loop.
5. The verifier gate skips critic calls for broken renders and sends concrete repair feedback.
6. The critic/orchestrator loop refines quality when the render is mechanically valid.