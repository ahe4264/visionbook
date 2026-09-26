# Figure spec: TransformerSWIN

**figure_id:** `TransformerSWIN`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/TransformerSWIN.png`

## input_prompt

This figure shows six panels labeled a) through f) illustrating the hierarchical windowed self-attention partitioning scheme used in the Swin Transformer. Panel a) shows the original photograph as the reference. In the remaining panels the partitions are shown as the photograph cut into slightly separated tiles with thin white gaps between them, each panel drawn with a slight 3D tilt: panels b) and c) show the image divided into 4×4 non-overlapping windows and the same 4×4 grid offset (shifted) by half a window width and height; panels d) and e) show 2×2 windows and their offset variant; and panel f) shows the degenerate 1×1 case in which the entire image is treated as a single attention region (panel captions read '4×4 windows', '4×4 offset windows', '2×2 windows', '2×2 offset windows', '1×1 window'). The figure demonstrates the Swin Transformer's shifted-window strategy: by alternating between regular and offset window partitions across successive transformer layers, the model enables information to flow across window boundaries without the quadratic cost of global self-attention.

## interactions

- Slider for window size (1 → 2 → 4): step through panels f (1×1), d (2×2), and b (4×4), refining the partition grid overlaid on the photograph and increasing the number of attention windows
- Toggle between regular and offset windows: shift the grid by half a window in both x and y (switching between panels b↔c or d↔e) and highlight how tokens that were split across a boundary in the regular grid share a single window in the offset grid
- Click on a window tile: highlight all tokens inside that tile and show the self-attention connections confined to those tokens, contrasting with a neighboring tile to illustrate the locality constraint at that window size
