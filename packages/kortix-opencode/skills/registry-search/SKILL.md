---
name: registry-search
description: Search the Kortix OCX registry to discover, evaluate, and install skills and tools. Use when the user asks to find, browse, install, or add capabilities — e.g. "find a skill for X", "what skills are available?", "install the PDF skill", "add browser automation", "can you do Y?", "search for Z skill". Load this skill to intelligently browse the registry, match the user's need to the right component, and install it via OCX CLI.
allowed-tools: Bash(ocx:*), Bash(curl:*), Bash(npx ocx:*)
---

# Registry Search — Discover & Install OCX Skills

## Overview

The Kortix OCX registry hosts installable skills and tools that extend agent capabilities. This skill gives you a workflow to search the registry, match user needs to components, and install them.

## Registry Endpoint

The live registry index is always available at:

```
https://master.kortix-registry.pages.dev/index.json
```

Individual skill metadata:
```
https://master.kortix-registry.pages.dev/skills/<skill-name>/SKILL.md
```

## Step 1 — Fetch & Display the Registry

Always start by fetching the current index to get a live list of available components:

```bash
curl -s https://master.kortix-registry.pages.dev/index.json | python3 -m json.tool
```

Or pretty-print just names + descriptions:

```bash
curl -s https://master.kortix-registry.pages.dev/index.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('components', []):
    print(f\"  {c['name']:40} {c.get('description','')}\")
"
```

## Step 2 — Match User Need to a Component

Given the user's request, identify the best matching skill(s) from the registry. Use semantic matching:

| User says | Best match |
|-----------|-----------|
| "browse websites", "click", "fill forms", "screenshot" | `agent-browser` |
| "read/write PDF" | `pdf` |
| "Word documents", "docx" | `docx` |
| "spreadsheet", "Excel", "CSV" | `xlsx` |
| "research topic deeply", "multi-source report" | `deep-research` |
| "presentation", "slides" | `presentations` |
| "video", "animation" | `remotion` |
| "text-to-speech", "voice" | `elevenlabs` |
| "email", "send mail", "IMAP" | `email` |
| "domain", "WHOIS", "DNS" | `domain-research` |
| "legal document", "contract" | `legal-writer` |
| "logo", "brand design" | `logo-creator` |
| "academic paper", "citation" | `openalex-paper-search` |
| "LaTeX paper", "scientific writing" | `paper-creator` |
| "AI model", "image generation", "Replicate" | `replicate` |
| "agent forum", "knowledge sharing" | `woa` |
| "full-stack", "React", "Convex" | `fullstack-vite-convex` |
| "build AI agent", "agent SDK" | `agent-builder` |

## Step 3 — Preview a Skill Before Installing

Fetch the SKILL.md to show the user what they'll get:

```bash
curl -s https://master.kortix-registry.pages.dev/skills/<skill-name>/SKILL.md | head -60
```

## Step 4 — Install via OCX

Once you've identified the right skill, install it:

```bash
# Check if OCX is available
ocx --version 2>/dev/null || npm install -g ocx

# Initialize OCX in the project (if not already done)
ocx init 2>/dev/null || true

# Add the Kortix registry (already configured in ocx.jsonc, but ensure it's registered)
ocx registry add https://master.kortix-registry.pages.dev --name kortix 2>/dev/null || true

# Install the skill (it gets copied into .opencode/skills/)
ocx add kortix/<skill-name>
```

After installing, load the skill immediately with the `skill()` tool to start using it.

## Step 5 — Load After Install

After a successful `ocx add`, always load the newly installed skill:

```
skill("<skill-name>")
```

Example: after `ocx add kortix/pdf` → load with `skill("pdf")`

This injects the skill instructions into context so you can immediately use the capability.

## Full Example Workflow

User: "I need to extract data from a PDF"

```bash
# 1. Confirm skill exists in registry
curl -s https://master.kortix-registry.pages.dev/index.json | python3 -c "
import json, sys
for c in json.load(sys.stdin)['components']:
    if 'pdf' in c['name'].lower():
        print(c['name'], '-', c.get('description',''))
"

# 2. Install
ocx add kortix/pdf

# 3. Load
# → skill("pdf")
```

## Registry Search (keyword filter)

To search by keyword across all component names and descriptions:

```bash
QUERY="browser"
curl -s https://master.kortix-registry.pages.dev/index.json | python3 -c "
import json, sys
q = '${QUERY}'.lower()
for c in json.load(sys.stdin).get('components', []):
    if q in c['name'].lower() or q in c.get('description','').lower():
        print(f\"  {c['name']:40} {c.get('description','')}\")
"
```

## Checking Already Installed Skills

```bash
ls .opencode/skills/ 2>/dev/null || echo "No skills installed yet"
```

## Available Skills in Kortix Registry

| Skill | Description |
|-------|-------------|
| `deep-research` | Comprehensive multi-source research reports |
| `docx` | Word document creation and editing |
| `domain-research` | Domain availability checking and WHOIS |
| `elevenlabs` | Text-to-speech and voice cloning |
| `email` | IMAP/SMTP email sending and receiving |
| `fullstack-vite-convex` | Full-stack React + Convex development |
| `legal-writer` | Legal document drafting |
| `logo-creator` | Professional logo and brand design |
| `openalex-paper-search` | Academic paper search via OpenAlex |
| `paper-creator` | Scientific paper writing in LaTeX |
| `pdf` | PDF reading, creation, manipulation, OCR |
| `remotion` | Video creation in React |
| `replicate` | AI model inference via Replicate API |
| `xlsx` | Spreadsheet, CSV, and Excel processing |

## Decision Logic

When a user asks for a capability:

1. **Check if already installed** → `ls .opencode/skills/`
2. **If not installed** → match to registry component (table above)
3. **If ambiguous** → fetch live index and keyword-search
4. **Confirm match** → preview SKILL.md if needed
5. **Install** → `ocx add kortix/<skill-name>`
6. **Load** → `skill("<name>")`
7. **Proceed** with the original task using the newly loaded skill
