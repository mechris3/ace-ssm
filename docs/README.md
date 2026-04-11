# ACE-SSM Documentation

> The Glass Box Manual — everything you need to understand, extend, and trust the ACE-SSM Core Inference Engine.

## Suggested Reading Order

Start here if you're new to the codebase. Each doc builds on the previous one.

| # | Document | What you'll learn |
|---|----------|-------------------|
| 1 | [Project Summary](./summary.md) | The 30-second pitch — what ACE-SSM is, the tech stack, and the core vision |
| 2 | [The Data Trinity](./data-trinity.md) | The three layers of truth (Task Structure → Knowledge Base → SSM) and how they interact |
| 3 | [The Inference Cycle](./inference-cycle.md) | The Triple-Operator "heartbeat" — Goal Generator, Search Operator, Knowledge Operator — with worked scoring examples |
| 4 | [Confirmation Chains](./confirmation-chains.md) | How hypotheses become facts through transitive deductive chains, with pulse-by-pulse walkthroughs |
| 5 | [Engine FSM](./engine-fsm.md) | The 4-state finite state machine (IDLE → THINKING → INQUIRY → RESOLVED) and transition rules |
| 6 | [Correctness Properties](./PROPERTIES.md) | The 17 formal properties that define "correct," mapped to requirements, source files, and PBT tests |

## Reference Documents

These were the original design inputs from before implementation:

| Document | Purpose |
|----------|---------|
| [Architectural Deep-Dive](./ace-ssm.md) | The original mechanics document — ontological hierarchy, cognitive cycle, Glass Box philosophy |
| [Handover Notes from Gemini](./handover-notes-from-gemini.md) | The master architectural spec — TypeScript contracts, operator pseudocode, RxJS orchestration, D3 visualization plans |

## Quick Links

| What you're looking for | Where to go |
|------------------------|-------------|
| "How does scoring work?" | [Inference Cycle → Search Operator](./inference-cycle.md#operator-2-search-operator-strategy) |
| "Why does the engine ask questions?" | [Inference Cycle → INQUIRY_REQUIRED flow](./inference-cycle.md#inquiry_required-flow) |
| "How do hypotheses get confirmed?" | [Confirmation Chains](./confirmation-chains.md) |
| "What are the 17 properties?" | [Properties Ledger](./PROPERTIES.md#summary-table) |
| "What state is the engine in?" | [Engine FSM](./engine-fsm.md#the-4-states) |
| "What's Layer 1 / Layer 2 / Layer 3?" | [Data Trinity](./data-trinity.md#overview) |
