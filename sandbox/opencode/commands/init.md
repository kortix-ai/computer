---
description: Initialize project knowledge by scanning the workspace. Updates the Project section of MEMORY.md.
agent: kortix-main
---

# Project Initialization

Scan the current workspace and update the Project section of `workspace/.kortix/MEMORY.md`.

## Exploration checklist

Do ALL of these in parallel where possible:

1. **Directory structure** — top-level layout, key directories
2. **Project manifest** — package.json, Cargo.toml, pyproject.toml, go.mod, etc.
3. **Git history** — `git log --oneline -30` for recent activity and commit style
4. **README** — project description
5. **Build/test/lint commands** — scripts in package.json, Makefile, CI configs
6. **CI/CD** — .github/workflows/, .gitlab-ci.yml, etc.
7. **Dependencies** — key libraries, frameworks, external services
8. **Architecture** — entry points, module boundaries, data flow
9. **Config files** — .env.example, tsconfig.json, eslint.config.*, etc.
10. **Docker** — Dockerfile, docker-compose.yml

## Update MEMORY.md

Update the Project section with structured findings:

```markdown
## Project

**Overview:** [One paragraph description]
**Tech Stack:** [Languages, frameworks, key libraries]
**Architecture:** [Key modules, entry points]
**Commands:** [Build, test, lint, dev, deploy]
**Conventions:** [Commit style, naming, patterns]
```

Keep it concise. If there's deep detail worth preserving, write it to `workspace/.kortix/memory/project-details.md`.

Also update the Scratchpad to note the project was scanned.

$ARGUMENTS
