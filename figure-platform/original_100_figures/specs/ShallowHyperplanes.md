# Figure spec: ShallowHyperplanes

**figure_id:** `ShallowHyperplanes`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/ShallowHyperplanes.png`

## input_prompt

This figure illustrates how individual neurons in a shallow neural network define hyperplane decision boundaries in input spaces of increasing dimension, across three side-by-side panels labeled a), b), and c). Panel a) shows a one-dimensional input space with a horizontal number line labeled x_1 and a single point (the origin dot) marking where the linear threshold function crosses zero, representing a hyperplane as a point in 1D. Panel b) shows a two-dimensional input space with axes x_1 and x_2 and two colored lines passing through the origin: a vertical teal line and a horizontal orange-terracotta line, each representing a separate hyperplane boundary that divides the 2D plane into two half-spaces. Panel c) shows a three-dimensional input space with axes x_1, x_2, and x_3, rendered as a perspective cube with a light gray front face and teal side face, where the flat face of the cube represents a plane slicing through 3D space — the hyperplane in 3D. The figure demonstrates how the linear pre-activation of a neuron defines a hyperplane that separates input space into two regions, with the dimensionality of the hyperplane being one less than the input dimensionality.

## interactions

- Slider for weight w: tilt the orientation of a selected hyperplane by adjusting one weight component and watch the shaded positive/negative classification regions update in the plot
- Drag an input point (x1, x2, x3): move the point through the 3D feature space and show which side of each neuron's hyperplane it falls on, with the final output class updating to reflect the combined decisions
