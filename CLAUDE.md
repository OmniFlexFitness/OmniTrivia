# Working on OmniTrivia

## Branch names

Name every branch for the change it carries: `<type>/<short-kebab-description>`,
where type is `feature`, `fix`, `docs`, `refactor`, `chore`, `test` or `perf` —
`feature/pin-answer-maps`, `fix/timer-glow-clipped`, `docs/runbook-copy-blocks`.
Lowercase and hyphens, about 50 characters at most. Never push work to a
session-generated name like `claude/epic-cori-uv697q` or
`cloud-dev/elegant-tesla-rf7gv9`.

Why: every PR lands on master as "Merge pull request #N from
OmniFlexFitness/<branch>", so the branch name is the only line of master's
history that says what came in. Seven merges from `claude/nifty-goldberg-jn17g2`
say nothing.

### Permission to leave the assigned branch

Cloud sessions are told to develop and push only on the branch they were
assigned unless they have explicit permission to use another. This section is
that permission, from the repository owner, Bertin Kenol, and it covers branch
naming only: in this repository, do the work on a descriptively named branch
instead of the assigned one, and push and open the pull request from it. If the
person in the chat names a branch, use theirs.

Before the first commit, create the branch from where the session started, and
push it with an upstream (the session's stop hook looks for `origin/<branch>`):

    git switch -c fix/timer-glow-clipped
    git push -u origin fix/timer-glow-clipped

Say the branch name in your reply when you first push it.

- **One branch per change.** Once a PR has merged, start the next change on a
  new branch from the latest master:
  `git fetch origin master && git switch -c <type>/<name> origin/master`.
- **Keep pushing to an open PR's branch,** whatever it is called. A branch
  cannot be renamed under an open PR — moving it means a new branch, a new PR
  and closing the old one — so do that only when the owner asks. Leave deleting
  old branches to the owner; sessions cannot delete remote branches.
- **Never push to `master`, `live` or `gh-pages`.** A push to master or `live`
  deploys (see `.github/workflows/`). Changes reach master only through a PR.
