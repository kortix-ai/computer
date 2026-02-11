---
name: kortix-skill-creator
description: "Guide for creating effective skills. Use this skill when the user wants to create a new skill (or update an existing skill) that extends the agent's capabilities with specialized knowledge, workflows, or tool integrations."
---

# Skill Creator

Guide for creating effective skills.

## About Skills

Skills are modular, self-contained packages that extend the agent's capabilities by providing specialized knowledge, workflows, and tools. They transform a general-purpose agent into a specialized one equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key

The context window is a public good. Skills share the context window with everything else: system prompt, conversation history, other Skills' metadata, and the actual user request.

**Default assumption: the agent is already very smart.** Only add context it doesn't already have. Challenge each piece of information: "Does the agent really need this explanation?" and "Does this paragraph justify its token cost?"

Prefer concise examples over verbose explanations.

### Set Appropriate Degrees of Freedom

Match the level of specificity to the task's fragility and variability:

**High freedom (text-based instructions)**: Multiple approaches valid, decisions depend on context.

**Medium freedom (pseudocode or scripts with parameters)**: Preferred pattern exists, some variation acceptable.

**Low freedom (specific scripts, few parameters)**: Operations are fragile and error-prone, consistency is critical.

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md (required)

- **Frontmatter** (YAML): Contains `name` and `description` fields (required). Only `name` and `description` are read by the agent to determine when the skill triggers, so be clear and comprehensive.
- **Body** (Markdown): Instructions and guidance for using the skill. Only loaded AFTER the skill triggers.

#### Bundled Resources (optional)

##### Scripts (`scripts/`)
Executable code for tasks requiring deterministic reliability or repeatedly rewritten.

##### References (`references/`)
Documentation loaded as needed into context. Keeps SKILL.md lean. If files are large (>10k words), include grep search patterns in SKILL.md.

##### Assets (`assets/`)
Files used within the output (templates, images, boilerplate). Not loaded into context.

#### What NOT to Include

- README.md, INSTALLATION_GUIDE.md, QUICK_REFERENCE.md, CHANGELOG.md
- Auxiliary context about creation process, setup/testing procedures, user-facing documentation

### Progressive Disclosure

Skills use a three-level loading system:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words)
3. **Bundled resources** - As needed (unlimited since scripts can run without reading into context)

Keep SKILL.md body under 500 lines. Split content into separate files when approaching this limit.

**Pattern 1: High-level guide with references**
```markdown
# PDF Processing
## Quick start
[code example]
## Advanced features
- **Form filling**: See FORMS.md
- **API reference**: See REFERENCE.md
```

**Pattern 2: Domain-specific organization**
```
bigquery-skill/
├── SKILL.md (overview and navigation)
└── reference/
    ├── finance.md
    ├── sales.md
    └── product.md
```

**Pattern 3: Conditional details**
```markdown
## Creating documents
Use docx-js. See DOCX-JS.md.
## Editing documents
For simple edits, modify XML directly.
**For tracked changes**: See REDLINING.md
```

## Skill Creation Process

### Step 1: Understand with Concrete Examples
Understand concrete usage examples. Ask:
- "What functionality should this skill support?"
- "Can you give examples of how it would be used?"
- "What would a user say that should trigger this skill?"

### Step 2: Plan Reusable Contents
Analyze each example to identify what scripts, references, and assets would help when executing workflows repeatedly.

### Step 3: Initialize the Skill
Create the skill directory structure:
```
skill-name/
├── SKILL.md
├── scripts/
├── references/
└── assets/
```

### Step 4: Edit the Skill

**Start with reusable contents** -- scripts, references, and assets identified in Step 2. Test added scripts by running them.

**Update SKILL.md:**

##### Frontmatter
- `name`: The skill name
- `description`: Primary triggering mechanism. Include both what the skill does AND specific triggers/contexts. Include ALL "when to use" information here (the body is only loaded after triggering).

##### Body
Write instructions for using the skill and its bundled resources. Use imperative/infinitive form.

### Step 5: Package and Verify
Validate the skill:
- YAML frontmatter format and required fields
- Skill naming conventions and directory structure
- Description completeness and quality
- File organization and resource references

### Step 6: Iterate
1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Identify how SKILL.md or bundled resources should be updated
4. Implement changes and test again
