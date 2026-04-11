[← Back to Docs Index](./README.md)

# ARCHITECTURAL DEEP-DIVE: THE MECHANICS OF ACE-SSM

## 1. THE ONTOLOGICAL HIERARCHY
To understand ACE-SSM, you must understand the three layers of "Truth" the system manages. It is not a flat database; it is a nested hierarchy of abstraction.

| Layer | Name | Analogy | Purpose |
| :--- | :--- | :--- | :--- |
| **Layer 1** | **Task Structure** | The Laws of Physics | Defines the *types* of things that can exist (e.g., "Diseases," "Symptoms") and the *legal ways* they can interact (e.g., "Diseases INDUCE Symptoms"). |
| **Layer 2** | **Knowledge Base** | The Encyclopedia | A massive library of specific facts that obey Layer 1. (e.g., "COVID-19 is a Disease," "Cough is a Symptom," "COVID-19 INDUCES Cough"). |
| **Layer 3** | **SSM** | The Working Memory | The "Live Graph." It represents the *current* case. It starts with one node (e.g., "Patient has Cough") and uses Layers 1 & 2 to build a theory. |

---

## 2. THE COGNITIVE CYCLE (THE "HEARTBEAT")
The engine does not "predict" the next word. It performs a **discrete cycle of three logical operators** every time the heartbeat pulses.

### Step A: Abductive Goal Generation (The "Gap Finder")
The engine looks at the **SSM** and compares it to the **Task Structure**. 
* **The Logic:** If the SSM has a node of type `Symptom`, and the Task Structure says `Symptom` is `CAUSED_BY` an `Etiologic Agent`, the engine realizes there is a **logical gap**.
* **The Output:** A list of all possible "Goals" (e.g., "Find the cause of this cough").

### Step B: Strategic Search (The "Strategist")
The engine now has 50 possible goals. It must decide which one to pursue. It uses **Heuristic Weighting**:
* **Urgency:** Does this goal lead to a "Red Flag" (e.g., Sepsis)?
* **Parsimony:** Does this goal connect to something we already suspect? (Occam's Razor).
* **Cost:** Will this goal require us to stop and ask the user a question?
* **The Output:** The **Rationale Packet**. This is a record of *why* Goal A was picked over Goal B.

### Step C: Resolution (The "Knowledge Operator")
The engine takes the "Winning Goal" and looks into the **Knowledge Base**.
* **Success:** It finds a match (e.g., "Pneumonia causes Cough") and adds "Pneumonia" to the SSM.
* **Failure:** It finds no match, or the match requires user confirmation. It flags an **Inquiry**, pauses the engine, and asks the user: "Does the patient have chest pain?"

---

## 3. THE "GLASS BOX" VS. THE "BLACK BOX"
In a standard AI (Black Box), you provide an input and get an output. In ACE-SSM (Glass Box), the **process is the product**.

* **No Hidden Layers:** Every node in the SSM exists because a specific rule in the Task Structure was triggered and a specific fragment in the Knowledge Base was found.
* **The Reasoning Chain:** Because we save the **Rationale Packet** from Step B at every pulse, we can generate a perfectly accurate "Audit Trail." 
* **User Control:** Because the "Strategist" uses weights (Urgency, Parsimony), the user can turn a dial in the UI to make the AI "more cautious" or "more aggressive" in real-time.

---

## 4. OPERATIONAL STATES
Kiro must implement the engine as a **Finite State Machine (FSM)**:

1.  **IDLE:** Waiting for user input or the "Play" signal.
2.  **THINKING:** The RxJS pulse is active. The engine is cycling through Goal -> Search -> Knowledge.
3.  **INQUIRY:** The engine has reached a point where it needs human data. It halts and highlights the "Question" node in the D3 graph.
4.  **RESOLVED:** No more goals can be generated; the model is "saturated" or a terminal node (e.g., Treatment) has been reached.

---

## 5. SUMMARY FOR THE DEVELOPER
You are building a system that **externalizes thought**. Your job is to ensure that the transition from a "Goal" to a "Model Update" is never invisible. The D3 visualization isn't just "eye candy"; it is a real-time window into the engine's current state of abduction and deduction.