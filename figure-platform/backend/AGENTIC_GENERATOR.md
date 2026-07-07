# Agentic Figure Generator Branch

This branch keeps the existing figure-generation pipeline shape:

```text
planner -> generator -> verifier/critic -> orchestrator/refine loop
```

The main change is that the generator stage can be replaced with a bounded Claude coding
agent. The agent writes the HTML/Three.js payload, calls an in-process render tool, reads
real browser verification feedback plus a screenshot, repairs the code, and returns the
last usable HTML.

## What Is Included

- `generation-agent.js`: Claude Agent SDK generator for 3D figures.
- `generation-2d-agent.js`: Claude Agent SDK generator for 2D standalone demos.
- `verify.js` and `verify-2d.js`: rendered verification before expensive critic calls.
- `figure_loop.js`: verifier gate, seeded refinement, per-stage timing logs.
- `batch_benchmark.js`: 30-figure benchmark runner.
- `batch_3d_demo_experiment.js`: standalone 3D demo runner.
- `batch_2d_demos.js`: 2D standalone demo runner.
- `build_3d_comparison_gallery.js`: combines 3D result sets into one gallery.

Generated galleries and batch outputs are intentionally ignored by git:

```text
figure-platform/backend/agent_batch_out/
figure-platform/backend/agent_batch_limited_refined_out/
figure-platform/backend/agent_2d_batch_out/
figure-platform/backend/agent_3d_demo_out/
figure-platform/backend/agent_3d_demo_refined_out/
```

To share those results, run the batch locally or archive/upload those output folders
separately.

## Required Environment

From `figure-platform/backend`:

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."
```

The actual key is never committed. The code only reads `process.env.ANTHROPIC_API_KEY`.

The planner and critic still use the existing provider setup in `models.js`, so keep any
existing OpenAI/Gemini/Anthropic env vars used by the rest of the pipeline.

## Generator Modes

Set `GENERATOR_MODE` to choose the generator behavior:

```text
single    original single-shot generator
agent     Claude coding agent generates and repairs directly
escalate  single-shot first, then Claude agent only if render verification fails
```

Useful agent controls:

```bash
export GENERATOR_MODE=agent
export AGENT_GEN_MODEL=sonnet
export AGENT_GEN_EFFORT=low
export AGENT_GEN_THINKING_TOKENS=4096
export AGENT_GEN_MAX_TURNS=8
export AGENT_GEN_TIMEOUT_MS=300000
```

## Test One Figure

```bash
cd figure-platform/backend
GENERATOR_MODE=agent node test_agent_figure.js
```

This logs plan, generation, verification, critic, orchestrator, and agent render timings.

## Run 3D Benchmark Batch

```bash
cd figure-platform/backend
GENERATOR_MODE=agent \
AGENT_GEN_MODEL=sonnet \
TEST_MAX_ATTEMPTS=2 \
node batch_benchmark.js
```

Outputs are written to:

```text
figure-platform/backend/agent_batch_out/
```

To serve and open the 3D gallery:

```bash
cd figure-platform/backend/agent_batch_out
python3 -m http.server 8976
```

Open:

```text
http://127.0.0.1:8976/gallery.html
```

Do not open the generated HTML files with `file://`; Chrome may block local file access.
Use the local HTTP server URL.

## Run 3D Standalone Demo Experiment

```bash
cd figure-platform/backend
THREE_D_DEMO_SCOPE=all \
THREE_D_DEMO_RUNNER_CONCURRENCY=5 \
TEST_MAX_ATTEMPTS=2 \
node batch_3d_demo_experiment.js
```

Default output:

```text
figure-platform/backend/agent_3d_demo_out/
```

Serve it with:

```bash
cd figure-platform/backend/agent_3d_demo_out
python3 -m http.server 8978
```

Open:

```text
http://127.0.0.1:8978/gallery.html
```

## Run 2D Standalone Demo Batch

```bash
cd figure-platform/backend
node batch_2d_demos.js
```

Default output:

```text
figure-platform/backend/agent_2d_batch_out/
```

Serve it with:

```bash
cd figure-platform/backend/agent_2d_batch_out
python3 -m http.server 8977
```

Open:

```text
http://127.0.0.1:8977/gallery.html
```

## Build Combined 3D Gallery

After generating multiple 3D result folders, rebuild the comparison gallery:

```bash
cd figure-platform/backend
node build_3d_comparison_gallery.js
```

Then serve `agent_batch_out` on port `8976` as above. The generated comparison page links
to other result folders by port, so serve those folders too when comparing columns:

```bash
cd figure-platform/backend/agent_3d_demo_out && python3 -m http.server 8978
cd figure-platform/backend/agent_3d_demo_refined_out && python3 -m http.server 8979
cd figure-platform/backend/agent_batch_limited_refined_out && python3 -m http.server 8980
```

## Benchmarking / Pairwise Evaluation

This branch includes the existing evaluator files:

```text
backend/evaluator.js
backend/pairwise_evaluator.js
```

Generated batch results are not committed. To benchmark the agentic generator, first make
one of these folders exist locally by generating results or copying a shared output bundle:

```text
backend/agent_batch_out/
backend/agent_batch_limited_refined_out/
backend/agent_3d_demo_out/
backend/agent_3d_demo_refined_out/
```

Each folder should contain a `manifest.json` plus the generated `.html` and `.final.jpg`
files from the batch runner. Then start the backend:

```bash
cd figure-platform/backend
node server.js
```

The `/api/pairwise/setups` route scans those local folders and exposes them as benchmark
setups alongside `prompt_experiments/` and `backend/results/`. The pairwise evaluator uses
the generated `.html`, `.final.jpg` screenshot, and source image path from the manifest.

To scan custom output locations:

```bash
AGENT_BATCH_OUTPUT_DIRS="agent_batch_out,/absolute/path/to/output" node server.js
```

## Notes

- The agent is bounded by max turns, wall-clock timeout, concurrency, and budget settings.
- The agent is not allowed to use shell, file system, web, or arbitrary tools; it only sees
  the source image and the in-process render tool.
- The verifier runs before the critic so mechanically broken figures are repaired before
  spending quality-judgment calls.
- Timing information is written to the batch logs and manifest records where available.
