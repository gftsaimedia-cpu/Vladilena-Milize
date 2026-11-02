---
name: superpowers-luna-workers
description: Use when Superpowers tasks involve delegated reading, summarization, or implementation with isolated worktrees.
---

# Superpowers with Luna workers

This addon supplements Superpowers for repo reading, summaries, and implementation:

| Work | Owner |
|---|---|
| Read repository material and summarize plans/code | Luna reader; return concise findings with file:line evidence |
| Set up/verify branch and worktree; authorized integration | Luna operator |
| Implement, test, and correct | Luna implementer |
| Scope decisions, review worker summaries/diffs/evidence, report verdict | Lead session |

The lead does not own bulk source summaries or implementation. Luna roles mean delegated worker agents: the lead never relabels itself as a Luna worker or performs Git writes. The same Luna worker may perform operator and implementer duties sequentially; do not spawn separate agents for routine setup and implementation. For a task combining reading and implementation, assign each phase to a Luna worker and review the handoff. The lead reviews implementation against spec and quality and sends corrections to the same worker. A separate reviewer, if used, also runs Luna/low.

## Dispatch

The user's standing request requires every worker to use `model: "gpt-6-luna"`, `reasoning_effort: "low"`, and `fork_turns: "none"`; this does not need repeating in each task brief. Apply it on every spawn. The live tool schema is authoritative. If unavailable, report the blocker; never upgrade or implement inline. Ask only about missing capability and continue independent work. Workers do not spawn workers without lead direction.

A reader may inspect the current tree read-only without a worktree. Before implementation, assign a Luna operator to establish and verify a distinct branch and worktree. Use managed worktree tools only with an explicit reviewed base SHA; otherwise the operator uses ordinary Git worktree setup. A branch alone does not isolate shared files. Native agents share cwd: set absolute `workdir` on every `exec_command`; use absolute `apply_patch` targets inside the assigned worktree; pass explicit paths to other tools. Verify Git top-level, branch, HEAD, and actual path. Do not assume uncommitted files were copied. Preserve and account for dirty user files; a dirty tree alone is not a blocker. If actual permissions or tool capability prevent isolation, stop implementation and report the blocker without bypassing restrictions; continue independent permitted work. Never implement business code in the main/shared checkout.

Parallelize independent tasks; serialize overlapping files or dependency/contract conflicts (for example `db.ts`), not unrelated work in one module. Count the lead against runtime slots (four total means at most three workers); give each shared file one owner.

## Task contract

Each dispatch states objective/evidence, bounded files, absolute workdir, branch/worktree/base SHA, relevant Superpowers requirements, and result format. Require file:line findings, changed files, actual commands/exit codes, unrun checks, and task/branch/worktree/base/commit identity.

Example call the native `collaboration.spawn_agent` tool directly in its JSON form (outside `functions.exec`):

```json
{
  "task_name": "fix_timeout",
  "fork_turns": "none",
  "model": "gpt-6-luna",
  "reasoning_effort": "low",
  "message": "Implement the approved timeout fix. Set exec_command workdir to C:\\Users\\me\\repo\\.worktrees\\timeout; use absolute apply_patch targets under that worktree. First verify Git top-level, branch, HEAD, actual path, and reviewed base SHA <sha>. Follow Superpowers TDD. Return changed files, concise file:line findings, exact verification commands and exit codes, missing checks, and task/branch/worktree/base/commit identity. Do not spawn agents."
}
```

After two failed attempts, reframe smaller and return to the same worker via `followup_task`; lead does not edit. Delegate and perform permitted routine worktree setup without asking again for approval already given. Ask only for an unresolved capability choice; if tools or Git permissions actually prevent setup, report the blocker without bypass. Delegate integration/commit only when authorized and writable. Never auto-merge, push, or deploy; do not repeat approval requests.

For "read three plans, then implement the already approved changes": assign one bounded Luna reader to read all three and return a concise comparison with path:line evidence; the lead reviews that summary; then the same Luna worker may establish and verify the isolated worktree and implement approved changes and run checks. The lead reviews the diff and evidence. Do not re-request approval just to start an already approved step.

## Red flags

| Thought or shortcut | Required response |
|---|---|
| “It is tiny; I can patch it here.” | Assign it to Luna; keep the lead on review. |
| “The branch is separate, so files are isolated.” | Verify a distinct worktree and explicit worker `workdir`. |
| “The default model is close enough.” | Pass Luna + low explicitly or report the tool blocker. |
| “The worker failed twice; I know the fix.” | Reframe and return to the same worker. |
| “These tasks look parallel.” | Serialize shared-file/module work; stay within slot budget. |
| “That command probably passed.” | Report only observed commands, exit codes, and missing checks. |

Official references: [Agent skills](https://learn.chatgpt.com/docs/build-skills); [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) documents explicit model and effort values.
