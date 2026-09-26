# Figure spec: endpoint_error

**figure_id:** `endpoint_error`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/2d/endpoint_error.png`

## input_prompt

This figure contains two 2D vectors emanating from a common origin, illustrating the geometric definition of endpoint error in optical flow evaluation. The vector labeled (u, v) represents the ground truth flow vector, while the vector labeled (u-hat, v-hat) represents the predicted flow vector; both share the same base point but point in slightly different directions and have different magnitudes. A red line segment connects the tips (endpoints) of the two vectors, and this segment is labeled Endpoint error, making explicit that the loss is the Euclidean distance between the endpoint of the prediction and the endpoint of the ground truth. This figure establishes endpoint error as a vector-space distance metric, clarifying why it is sensitive to both directional and magnitude errors in the predicted flow field.

## interactions

- Drag the estimated vector tip (û,v̂) in any direction and see the red endpoint error segment stretch or shrink in real time as the distance between the two vector tips updates
- Drag the ground-truth vector tip (u,v) to set a new reference flow direction and magnitude, watching the red error segment reposition accordingly
- Toggle between endpoint error (straight-line distance between vector tips) and angular error (angle between the two vectors) metrics, highlighting which geometric quantity each measures in the diagram
