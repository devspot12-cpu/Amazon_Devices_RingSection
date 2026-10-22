---
name: sk-coding
description: Guides coding implementation, bug-fix work through repository-pattern reuse, protected-scope discipline, minimal edits, and evidence-based validation. Use when changing application code or tests in this repository.Output only the code — no explanations, no markdown fences unless asked. When chaging the code, do not write test cases unless asked for.
---

## Workflow

### 1. Establish the change


- Start from the most concrete anchor: a file, symbol, failing behavior, command, test, or nearby implementation.
- Read only enough local code and applicable guidance to identify the code that controls the behavior.
- State one testable hypothesis and one cheap check that could disprove it.
- Ask a focused question only when a safe, reversible implementation cannot resolve the ambiguity.

### 2. Preserve contracts and reuse patterns

- Treat legacy code, core files, and base abstractions as protected. Edit them only with explicit approval.
- Preserve public APIs, names, lifecycle behavior, and framework boundaries unless the task requires a change.
- Ignore unrelated worktree changes. Never revert user changes or use destructive Git commands without approval.
- Find the nearest implementation with matching behavior, lifecycle, data, and framework usage.
- Prefer repository patterns and documented conventions over new abstractions or generic examples. Adapt them for names, bindings, validation, errors, and edge cases.

### 3. Edit and validate

- Make the smallest change after the controlling path and hypothesis are clear.
- Add or update focused tests using the repository's required framework.
- Run the cheapest relevant executable check immediately: narrow test, then compile, typecheck, or lint. Use diff review only when no executable check exists.
- If the check supports the hypothesis but exposes a defect, repair the same slice and rerun it. If it disproves the hypothesis, take one nearby step toward the controlling code and reassess.
- Broaden validation for shared behavior, public contracts, or cross-module changes.

### 4. Delegate and recover deliberately

- Work directly on small local tasks. For complex or read-heavy tasks, delegate bounded exploration, research, testing, or review.
- Give each worker one question, expected evidence, edit permission, and return format. Review results before editing.
- Keep model and reasoning selection in runtime configuration; do not hard-code model-specific routing.
- After two failed attempts at the same issue, stop speculative edits. Compare the evidence, state the corrected hypothesis, and run one focused disambiguating check.
- If the path remains unclear, report the blocker and the evidence needed.

## Before finishing

- Confirm the change is grounded in a concrete code path and local pattern.
- Confirm protected files and unrelated worktree changes were left alone.
- Report commands, results, failures, blockers, and remaining test gaps accurately.
- Keep the final response concise. Use JSON only when requested or required for machine-readable output.
 