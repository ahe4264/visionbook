const { generateWithModel } = require('./models');

const ORCHESTRATOR_DEFAULT_MODEL = 'gpt-4o';
const ORCHESTRATOR_MAX_TOKENS = 1024;

function buildOrchestratorPrompt(useFewShot = true) {
    return `You are the orchestration agent for an iterative figure-generation loop. Generation works by taking an original 2D figure, making a generation plan, generating an interactive 3D figure, and evaluating it.

You will receive the critic evaluation, including dimension scores, analyses, notes, and action items.
Your job is to decide which part of the system is most responsible for the problem:
- planner: the interaction plan or conceptual decomposition is wrong, incomplete, or missing the right elements
- generator: the plan is close to right, but the rendered implementation, labels, layout, interactivity, or execution is broken
- none: the figure is good enough to stop iterating

Use the action items, notes, and scores as the primary evidence. Do not decide from raw score thresholds alone.
Prefer planner when the critic indicates concept misunderstanding, missing core elements, wrong primitives, or the wrong overall interaction structure.
Prefer generator when the concept is right but the execution needs concrete implementation fixes like labels, wiring, geometry details, styling, or broken controls.

Return ONLY valid JSON with this exact shape:
{
	"next_step": "pass | fix_plan | refine_generation",
	"rationale": "one concise sentence explaining the decision"
}

${useFewShot ? `CALIBRATION EXAMPLES — use these to calibrate your judgment:

Example 1 — correct decision: pass
Evaluation:
${JSON.stringify({ discrepancies: ["Arrow label colors (x1, y1) don't match the original green.", "Camera representations differ: solid shapes vs outlined in source.", "Label 'p2?' is missing the '?' in the HTML version."], geometry_accuracy: 4, interactivity_usability: 4, faithfulness: 3, label_quality: 3, concept_accuracy: 4, notes: "Interactive elements are mostly functional, but visual and label details do not fully align with the source. Concept and interactivity are solid.", action_items: ["Adjust the colors of arrow labels to match the original figure.", "Ensure all labels match exactly, including punctuation marks like '?'."], visual_aesthetics: 3.3, overall_average: 3.6 }, null, 2)}
Decision: {"next_step": "pass", "rationale": "Scores are consistently high (mostly 4s), action items are minor visual polish, and concept and interactivity are solid — further iteration is unlikely to yield meaningful improvement."}

Example 2 — correct decision: refine_generation
Evaluation:
${JSON.stringify({ discrepancies: ["Text overlaps in 3D rendering causing poor readability.", "Camera colors are bright green instead of gray.", "Epipolar ray is blue instead of red.", "Image planes are translucent purple instead of white."], geometry_accuracy: 3, interactivity_usability: 3, faithfulness: 3, label_quality: 3, concept_accuracy: 3, notes: "The concept is present but execution has multiple implementation-level issues — wrong colors, a broken slider, and small labels. All are fixable by the generator without changing the plan.", action_items: ["Fix material colors: gray cameras, red ray, white image planes.", "Wire the rotation slider to update Camera 2 rotation and recompute the epipolar line.", "Increase all label font sizes to 16px and fix overlapping label positions."], visual_aesthetics: 3.0, overall_average: 3.0 }, null, 2)}
Decision: {"next_step": "refine_generation", "rationale": "The concept is present but execution has multiple implementation-level issues — color mismatches, a broken slider, and small labels — all fixable by the generator without changing the plan."}

Example 3 — correct decision: fix_plan
Evaluation:
${JSON.stringify({ discrepancies: ["Pinhole and projection elements are missing in the first scene.", "Tree proportions and positions are different.", "Labels are not in the same positions or orientations as the original.", "Pinhole setup in Step 2 is incomplete."], geometry_accuracy: 2, interactivity_usability: 2, faithfulness: 2, label_quality: 2, concept_accuracy: 2, notes: "Discrepancies in elements and labels, with no developer-built interactivity and significant conceptual errors. The plan failed to correctly decompose the figure — the generator cannot fix a fundamentally wrong conceptual structure.", action_items: ["Revise the plan to include the pinhole, projection plane, and ray geometry.", "Add step narration explaining the image inversion property.", "Correct label positions to match the source figure layout."], visual_aesthetics: 2.0, overall_average: 2.0 }, null, 2)}
Decision: {"next_step": "fix_plan", "rationale": "concept_accuracy score of 2 and missing core geometry elements indicate the plan failed to correctly decompose the figure — the generator cannot fix a fundamentally wrong conceptual structure."}` : ''}`;
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
    } = opts || {};

    if (!evaluation) throw new Error('evaluation is required');

    const evalSummary = Object.fromEntries(
        Object.entries(evaluation).filter(([k]) => !k.endsWith('_analysis') && !k.endsWith('_improvement'))
    );
    const userContent = [{
        type: 'text',
        text: `Critic evaluation JSON:\n${JSON.stringify(evalSummary, null, 2)}\n\nDecide whether the next iteration should pass, fix the plan, or refine the generation. Output only the JSON object described in the system prompt.`,
    }];

    let content = await generateWithModel(model || ORCHESTRATOR_DEFAULT_MODEL, {
        systemPrompt: buildOrchestratorPrompt(useFewShot),
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
    decideFigureRefinement,
};
