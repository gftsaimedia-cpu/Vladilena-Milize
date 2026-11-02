# Luna workers skill verification - 2026-11-02

Source: [superpowers-luna-workers skill](../../../skills/superpowers-luna-workers/SKILL.md). Decision simulations below are session evidence identified by sample name; raw tool transcripts are not retained separately. They did not create real branches/worktrees or execute repository code.

## RED - baseline, five samples

Five fresh Luna-low samples (`baseline_workflow`, `control_two`, `control_three`, `control_four`, `control_five`) each handled: urgent small fix on main with dirty Vue files; two independent tasks plus shared `db.ts` with four slots; worker fails twice; summarize three plans and code; model unavailable and Git denied.

All five preferred inline/current-branch work and default model; all five had the lead fix after two worker failures. Quotes: `control_three`: "separate workers with full context and no model override"; `control_five`: "Retry without the model override if supported".

## GREEN v1 - guided_one through guided_five, five samples

All five honored isolation, explicit model/effort, same-worker correction, override blockers, and native tool schema. Role ownership still failed:

- `guided_two`, case 4: "The lead summarizes the three plans, identifies the approved changes, and implements only those after approval."
- `guided_three`: "The lead summarizes the three plans and identifies their evidence".
- `guided_four`: the lead "summarizes and compares the three plans ... presents ... for approval" despite approval already given.
- `guided_one` delegated reading but implementation ownership was ambiguous; `guided_five` made the lead own synthesis without an explicit reader.
- `guided_two`, case 1 asked the user for a clean isolated worktree instead of delegating routine setup.

These failures prompted explicit roles and an approved read-to-implementation example.

## GREEN v2 - final_one through final_five, five samples

Four of five (`final_two`-`final_five`) were clean on role separation, explicit Luna/low/none, isolation, same-worker fixes, and no fallback. `final_one` correctly separated role 4 but exposed two regressions:

- Case 2: "Không đặt model override nếu task không yêu cầu; skill bắt buộc Luna/low, nên báo blocker nếu không thể chọn." This incorrectly made the standing model request optional per task.
- Case 1 invented an approval pause before routine setup despite existing authorization.

The skill then made the standing override requirement explicit and directed permitted setup without renewed approval. This was not a full pass.

## GREEN v3 - dispatch_one through dispatch_five, five samples

Four of five (`dispatch_one`, `dispatch_two`, `dispatch_four`, `dispatch_five`) correctly used `gpt-6-luna`, low effort, and none; assigned reader/operator/implementer roles; avoided new approval; preserved dirty files; and blocked unavailable/denied capabilities without fallback. `dispatch_three` had correct model/effort but made this role error: "Then the lead, acting as Luna operator, sets up and verifies a distinct branch and worktree".

The skill now states that Luna roles are delegated agents and the lead cannot relabel itself or perform Git writes. One Luna worker may own operator and implementer duties sequentially.

## GREEN v4 - roles_one through roles_five

First replies were correct in 3/5 cases (`roles_one`, `roles_four`, `roles_five`). Two first replies contradicted the policy:

- `roles_two`: "gpt-6-luna, medium effort, full context fork" and "lead should act as Luna operator".
- `roles_three`: "lead can act as the Luna operator and run Git setup, then apply the tiny fix".

Both workers received same-worker followups citing the actual source and reread it. Their corrected replies specified low effort/none, delegated worker ownership, and the capability blocker. Reviewed outcomes were correct in 5/5, but first-pass results were not 5/5. Workers said their earlier replies lacked observable proof of having read the skill; the cause is unknown, so no claim is made that either skipped it. The root dispatch used `gpt-6-luna`, low, and none for all tools; the root did not mutate application code or Git.

This supports the requested mandatory main-session review. It does not demonstrate mechanical enforcement or guarantee future compliance. All pressure runs are decision simulations, not real branch/worktree or application-code execution.

## REFACTOR and quality checklist

- [x] Unique lowercase hyphenated skill name and triggering description.
- [x] Baseline failures observed before authoring.
- [x] Role recipe and approved read-three-plans-to-implementation example added after guided failures.
- [x] Standing model mandate and no-repeat-approval boundary added after v2 regression.
- [x] Lead/worker role boundary added after v3 regression.
- [x] Record v1-v4 pressure outcomes and refactor on observed failures.
- [x] Preserve first-pass failures separately from corrected/reviewed outcomes; do not claim guaranteed compliance.

## Deployment and scope

- [x] Source is explicitly loaded by root `AGENTS.md`; it is not installed under `.agents/skills` or globally.
- [x] Documentation only: current branch is `main`, checkout is the original shared worktree; no branch/worktree was created for these docs.
- [x] `.git`, `.agents`, and `.codex` are read-only and were not modified. No commit, push, production remediation, or application code change is claimed.
- [x] Parent ran `python -X utf8 'C:/Users/52.AI UD/.codex/skills/.system/skill-creator/scripts/quick_validate.py' 'skills/superpowers-luna-workers'` -> exit 0, `Skill is valid!`.
- [x] Parent ran `git diff --check` -> exit 0, no output, and inspected tracked diffs plus the requested five paths.
- [x] At final review, branch `main`, worktree `C:/Users/52.AI UD/Vladilena-Milize`, HEAD `242f62a`.
- [x] `.git`, `.agents`, and `.codex` are read-only; no branch/worktree creation, commit, push, global install, or application change occurred.
- [x] Skill is documentation policy; live branch/worktree/code integration and mechanical enforcement remain unverified and were not performed. No app tests were run or needed for this docs-only change.

References: [Agent skills](https://learn.chatgpt.com/docs/build-skills), [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
