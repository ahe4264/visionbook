# Figure spec: TransformerDecoder

**figure_id:** `TransformerDecoder`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/TransformerDecoder.png`

## input_prompt

This figure illustrates the architecture of an autoregressive transformer decoder, drawn as a horizontal left-to-right pipeline over a sequence of token positions. At the left, a vertical stack of word-embedding vectors represents the input sequence tokens: <start>, It, takes, great, courage, to, and let. These embeddings enter a large block labeled “Transformer with masked attention,” annotated (× K) to indicate K repeated decoder layers. Inside the transformer block, a lower-triangular masked-attention diagram shows that each token position can attend only to itself and earlier positions, preventing access to future tokens during next-token prediction. The block also shows residual/addition nodes and intermediate feature vectors that pass through the repeated masked-attention layers. At the right, each processed token representation feeds into a “Linear + softmax” block, producing a probability distribution over the vocabulary for the corresponding target token. The target-token labels shown on the far right are It, takes, great, courage, to, let, and yourself, illustrating shifted autoregressive training where the model predicts the next token at each position. This figure introduces the decoder-only transformer architecture for sequence generation, emphasizing causal masking and parallel next-token prediction across positions.

## interactions

- Slider for K (number of decoder layers): expand the ×K repeated block to show K stacked masked-attention layers, or collapse it back to the compact ×K notation
- Click a processing block (Word embeddings, Transformer with masked attention, residual Add ⊕, Linear + softmax, or Probability of target token) to highlight it and display a tooltip describing its role in next-token prediction
- Animate the prediction of the target word “yourself”: trace the input prefix ending at “let” through the masked-attention block, residual additions, and final Linear + softmax layer to the output probability row labeled “yourself”
