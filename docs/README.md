# ACE-SSM Documentation

> The Glass Box Manual — everything you need to understand, extend, and trust the ACE-SSM Inference Engine.

## Core Documents

| Document | What it covers |
|----------|---------------|
| [Inference Engine Reference](./INFERENCE_ENGINE_REFERENCE.md) | **The authoritative reference.** Complete specification of the engine: Data Trinity, Triple-Operator cycle, scoring formulas, FSM, inquiry system, diagnostic differential, strategic principles (S_G/S_L), certainty factors, goal constraints, domain validation, and all 10 design invariants. Cross-referenced against both Benaroch papers with `[Ref: MD Sec X.X]` tags in the code. |
| [Paper Gap Analysis](./PAPER_GAP_ANALYSIS.md) | Maps both Benaroch (1998) papers to our implementation. 8 gaps identified, all implemented. Tracks alignment between the academic architecture and the codebase. |
| [Correctness Properties](./PROPERTIES.md) | 17 formal properties defining "correct" for the engine, verified with property-based tests. **Note:** needs a future update pass to add properties for CFs, diagnostic differential, S_G, S_L, goal constraints, and domain validation. |

## Source Papers

| Paper | Reference |
|-------|-----------|
| [Goal-Directed Reasoning with ACE-SSM](./GoalDirectedReasoning.pdf) | Benaroch, M. (1998). *IEEE Transactions on Knowledge and Data Engineering*, Vol. 10, No. 5, pp. 706-726. The architecture paper — defines the three-step iterative cycle, goal constraints (G), strategic principles (S_G/S_L), diagnostic differential (G_g), and certainty factors. |
| [Knowledge Modeling with SSM-DKM](./KnowledgeModelling.pdf) | Benaroch, M. (1998). *Int. J. Human-Computer Studies*, 49, 121-157. The methodology paper — defines the SSM-DKM knowledge modeling stages (conceptualization, formalization, validation, instantiation), object-relation matrices, node-chain matrices, and declarative goal constraints. |

## Quick Links

| What you're looking for | Where to go |
|------------------------|-------------|
| How does scoring work? | [Inference Engine Reference §3.2.1](./INFERENCE_ENGINE_REFERENCE.md) |
| What are the node statuses? | [Inference Engine Reference §2.3.1](./INFERENCE_ENGINE_REFERENCE.md) |
| How does the diagnostic differential work? | [Inference Engine Reference §4.8](./INFERENCE_ENGINE_REFERENCE.md) |
| What is the solution focus (S_G)? | [Inference Engine Reference §4.9](./INFERENCE_ENGINE_REFERENCE.md) |
| How do goal ordering priorities work (S_L)? | [Inference Engine Reference §4.10](./INFERENCE_ENGINE_REFERENCE.md) |
| How does the inquiry modal work? | [Inference Engine Reference §5](./INFERENCE_ENGINE_REFERENCE.md) |
| What are the FSM states? | [Inference Engine Reference §4.1](./INFERENCE_ENGINE_REFERENCE.md) |
| How does domain validation work? | [Inference Engine Reference §4.11](./INFERENCE_ENGINE_REFERENCE.md) |
| How do declarative goal constraints work? | [Inference Engine Reference §4.12](./INFERENCE_ENGINE_REFERENCE.md) |
| What are the 17 correctness properties? | [Properties Ledger](./PROPERTIES.md) |
| How does our implementation map to the papers? | [Paper Gap Analysis](./PAPER_GAP_ANALYSIS.md) |
