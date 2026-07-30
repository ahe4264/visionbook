const { generateWithModel } = require('./models');

const ORCHESTRATOR_DEFAULT_MODEL = 'gpt-4o';
const ORCHESTRATOR_MAX_TOKENS = 1024;

// Only the framing sentence is medium-specific. The calibration examples below are
// deliberately SHARED: they calibrate the pass / fix_plan / refine_generation
// boundary, which is medium-agnostic, and the orchestrator never emits failure
// modes, so the 3D vocabulary inside them cannot leak into its output.
const ORCHESTRATOR_MODES = {
    '3d': { pipelineDescription: 'taking an original 2D figure, making a generation plan, generating an interactive 3D figure, and evaluating it' },
    '2d': { pipelineDescription: 'taking an original static 2D figure, making a generation plan, generating an interactive 2D figure (SVG.js / Chart.js / Mermaid), and evaluating it' },
};

function resolveOrchestratorMode(mode) {
    const key = String(mode || '3d').toLowerCase();
    if (!ORCHESTRATOR_MODES[key]) {
        console.warn(`[orchestrator] unknown mode "${mode}" — falling back to '3d'.`);
        return ORCHESTRATOR_MODES['3d'];
    }
    return ORCHESTRATOR_MODES[key];
}

function buildOrchestratorPrompt(useFewShot = true, mode = '3d') {
    const profile = resolveOrchestratorMode(mode);
    return `You are the orchestration agent for an iterative figure-generation loop. Generation works by ${profile.pipelineDescription}.

You will receive the critic evaluation, including failure modes, scores, notes, and action items.
Your job is to decide which part of the system is most responsible for the problem:
- planner: the interaction plan or conceptual decomposition is wrong, incomplete, or missing the right elements
- generator: the plan is close to right, but the rendered implementation, labels, layout, interactivity, or execution is broken
- none: the figure is good enough to stop iterating

Use the failure modes and action items as the primary evidence. Do not decide from raw score thresholds alone.
Prefer planner when the critic indicates concept misunderstanding, missing core elements, wrong primitives, or the wrong overall interaction structure.
Prefer generator when the concept is right but the execution needs concrete implementation fixes like labels, wiring, geometry details, styling, or broken controls.

Return ONLY valid JSON with this exact shape:
{
	"next_step": "pass | fix_plan | refine_generation",
	"rationale": "one concise sentence explaining the decision"
}

${useFewShot ? `CALIBRATION EXAMPLES — the decision turns on the failure modes, the five scores, and the notes, so only those are shown here.

${[
        {
            evaluation: { failure_modes: ['Color-Wrong', 'Missing-Labels'], geometry_accuracy: 4, interactivity_usability: 4, faithfulness: 3, label_quality: 3, concept_accuracy: 4, overall_average: 3.6, notes: 'Interactive elements are mostly functional, but visual and label details do not fully align with the source.' },
            decision: { next_step: 'pass', rationale: 'Scores are consistently high (mostly 4s), failure modes are minor visual polish issues, and concept and interactivity are solid — further iteration is unlikely to yield meaningful improvement.' },
        },
        {
            evaluation: { failure_modes: ['Color-Wrong', 'Scale-Wrong', 'Interaction-Missing', 'Camera-Wrong'], geometry_accuracy: 3, interactivity_usability: 3, faithfulness: 3, label_quality: 3, concept_accuracy: 3, overall_average: 3.0, notes: 'The rendering contains overlapping text, varying colors, and lacks precise interactivity, making it somewhat difficult to grasp the 3D representation.' },
            decision: { next_step: 'refine_generation', rationale: 'The concept is present but execution has multiple implementation-level issues — color mismatches, missing interactions, wrong camera angle, scale errors — all fixable by the generator without changing the plan.' },
        },
        {
            evaluation: { failure_modes: ['Missing-Labels', 'Interaction-Missing', 'Camera-Wrong', 'Color-Wrong', 'Concept-Misunderstood'], geometry_accuracy: 2, interactivity_usability: 2, faithfulness: 2, label_quality: 2, concept_accuracy: 2, overall_average: 2.0, notes: 'Discrepancies in elements and labels, with limited interactivity and conceptual errors.' },
            decision: { next_step: 'fix_plan', rationale: 'Concept-Misunderstood failure mode and all scores at 2/5 indicate the plan failed to correctly decompose the figure — the generator cannot fix a fundamentally wrong conceptual structure.' },
        },
    ].map(({ evaluation, decision }, i) =>
        `Example ${i + 1} → ${decision.next_step}\n${JSON.stringify(evaluation)}\n${JSON.stringify(decision)}`
    ).join('\n\n')}` : ''}`;
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => String(item).trim()).filter(Boolean);
}

function finalizeDecision(decision, evaluation) {
    const nextStep = ['pass', 'fix_plan', 'refine_generation'].includes(decision?.next_step)
        ? decision.next_step
        : 'refine_generation';

    return {
        next_step: nextStep,
        rationale: String(decision?.rationale || '').trim() || 'Decision derived from critic feedback.',
    };
}

/**
 * Decide whether the next iteration should refine the plan, refine the generation,
 * or stop.
 *
 * @param {{
 *   evaluation: object,
 *   model?: string,
 *   maxTokens?: number,
 * }} opts
 * @returns {Promise<object>}
 */
async function decideFigureRefinement(opts) {
    const {
        evaluation,
        model = ORCHESTRATOR_DEFAULT_MODEL,
        maxTokens = ORCHESTRATOR_MAX_TOKENS,
        useFewShot = true,
        mode = '3d',
    } = opts || {};

    if (!evaluation) throw new Error('evaluation is required');

    const userContent = [{
        type: 'text',
        text: `Critic evaluation JSON:\n${JSON.stringify(evaluation, null, 2)}\n\nDecide whether the next iteration should pass, fix the plan, or refine the generation. Output only the JSON object described in the system prompt.`,
    }];

    let content = await generateWithModel(model || ORCHESTRATOR_DEFAULT_MODEL, {
        systemPrompt: buildOrchestratorPrompt(useFewShot, mode),
        userContent,
        maxTokens,
    });

    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) content = fenced[1].trim();
    content = content.trim();

    let decision;
    try {
        decision = JSON.parse(content);
    } catch {
        return finalizeDecision({
            next_step: 'refine_generation',
            rationale: `Fallback decision used because the orchestrator output was not valid JSON: ${content.slice(0, 200)}`,
        }, evaluation);
    }

    return finalizeDecision(decision, evaluation);
}

module.exports = {
    ORCHESTRATOR_DEFAULT_MODEL,
    buildOrchestratorPrompt,
    decideFigureRefinement,
};
