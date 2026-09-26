# Figure spec: snellcropped

**figure_id:** `snellcropped`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/2d/snellcropped.png`

## input_prompt

This figure shows the geometry of light refraction at a planar interface between two optical media, as described by Snell's law. A horizontal black line divides the scene into an upper region with refractive index n1 and a lower region with refractive index n2; a thick blue line traces the ray direction as it strikes the interface and continues into the second medium. A thin vertical line marks the surface normal at the point of incidence, with a small right-angle square confirming its perpendicularity to the interface; the angle theta_1 is measured between the incoming ray and the normal above the interface, and theta_2 is measured between the refracted ray and the normal below. The ray bends toward or away from the normal depending on the relative magnitudes of n1 and n2, embodying the relationship n1 sin theta_1 = n2 sin theta_2. This figure introduces refraction geometry as the physical basis for how lenses bend light and form images.

## interactions

- Drag the incident ray to change θ₁ and watch θ₂ update in real time according to n₁ sin θ₁ = n₂ sin θ₂, with both angle arc labels refreshing as the ray rotates about the interface point
- Sliders for refractive indices n₁ and n₂: show how increasing n₂ relative to n₁ bends the refracted ray closer to the surface normal, and vice versa
- Increase n₁ above n₂ and drag θ₁ past the critical angle to trigger total internal reflection, showing the refracted ray disappear below the interface and a reflected ray appear symmetrically above it
