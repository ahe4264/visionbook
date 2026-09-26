# Figure spec: translations

**figure_id:** `translations`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/2d/translations.png`

## input_prompt

This figure contains two side-by-side panels illustrating 2D translation as a geometric transformation in the xy-plane. In the left panel, an orange square at the origin is displaced to an upper-right position by a translation vector t, shown as a red arrow; the transformed square sits at coordinates (t_x, t_y) relative to the original. In the right panel, two successive translations are depicted: the square first moves by vector t to an intermediate position, then by vector s to a final position, with individual red arrows labeled t and s; a third red arrow labeled t+s connects the original square directly to the final position, demonstrating that the composition of two translations equals their vector sum. This figure establishes the additive composition rule for 2D translations, motivating their representation in homogeneous coordinates where composition reduces to matrix multiplication.

## interactions

- Drag to set the translation vector (tx, ty) and see both the geometric result and the homogeneous matrix update
- Chain a second translation and show the composed matrix, replacing the two static sub-panels
