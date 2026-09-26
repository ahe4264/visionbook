# Figure spec: LossLogisticSigmoid

**figure_id:** `LossLogisticSigmoid`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/LossLogisticSigmoid.png`

## input_prompt

This figure shows the logistic sigmoid function sig[z] plotted as a single smooth curve over the range z ∈ [−5, 5]. The horizontal axis is labeled z with tick marks at −5.0, 0.0, and 5.0, and the vertical axis is labeled sig[z] with tick marks at 0.0 and 1.0. A smooth orange S-shaped curve rises monotonically from near zero on the left to near one on the right, with its steepest slope occurring at z = 0 where the function equals exactly 0.5. Gray dashed lines indicate the horizontal asymptote at sig[z] = 1.0 and mark a vertical reference at z = 0, emphasizing the function’s symmetry and its asymptotic approach to both bounds. This figure introduces the logistic sigmoid as a differentiable, bounded activation function that squashes any real-valued input into the interval (0, 1), motivating its use for modeling probabilities in binary classification.

## interactions

- Drag a point along the sigmoid curve to display the exact coordinate pair (z, sig[z]) at that position
- Slider for a probability threshold: draw a horizontal line at the chosen value and mark the corresponding z intercept where the sigmoid crosses it
