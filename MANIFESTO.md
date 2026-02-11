# Kortix

## Turn Any Computer Into an AI Computer

---

Kortix is a computer that runs itself.

It's a full Linux machine — real filesystem, real shell, real tools — with an AI cortex wired into it. It connects to every tool you use, remembers everything it's ever learned, and runs autonomous workers around the clock. It writes its own code, builds its own tools, creates its own automations. The longer it runs, the smarter it gets.

It's not a chatbot. It's not a copilot. It's a computer with a brain.

---

## The Problem

The bottleneck for AI was never intelligence. It was always context.

Large language models are extraordinary reasoning machines trapped behind a blank text box. Every conversation starts from zero. The model doesn't know your name, your company, your codebase, your customers, your bank balance, your deployment pipeline, or the conversation you had with it yesterday. You have to re-explain everything, every time.

Meanwhile, your actual life is scattered across thirty different tools. Your code lives in GitHub. Your tasks live in Linear. Your conversations live in Slack. Your money lives in Mercury. Your domains live in Namecheap. Your docs live in Google Drive. Your deployments live in Vercel. Your hiring lives in Deel. No single system sees all of it. No AI can act on what it can't see.

The problem isn't that AI isn't smart enough. The problem is that AI is blind. It has no persistent memory, no access to your systems, no understanding of your context. It's a genius with amnesia sitting in an empty room.

Kortix gives it the room. And everything in it.

---

## The Idea

A Kortix instance is a full computer — Ubuntu, KDE desktop, bash, Python, Node.js, the whole stack — with an AI agent framework running on top. The agent has root access. It can install packages, write scripts, hit APIs, create files, run servers, deploy code. It has the same capabilities as a human sitting at a terminal, except it doesn't sleep, doesn't forget, and can run a hundred tasks in parallel.

It's three things layered together:

**A computer.** Real operating system, real filesystem, real tools. Not a sandboxed API behind a chat window. A machine where code runs, files exist, and processes persist. The agent's home.

**A cortex.** Persistent memory that survives across sessions, days, months. The agent remembers who you are, what you're working on, every decision that was made, every preference you've expressed. It connects to every tool and data source in your stack — email, code, finance, communication, infrastructure — and builds a living, unified understanding of your entire operation. It sees everything. It forgets nothing.

**A compounding workforce.** Not one agent — an army. A primary orchestrator that delegates to specialist workers, each running autonomously. Agents that write code, review PRs, process invoices, send emails, generate reports, manage deployments. Agents that create other agents. Agents that build their own tools. The instance gets more capable every single day because every agent can extend the system it runs on.

---

## Everything Is Files. And Everything Else Too.

The default shared state is the filesystem. Agents are markdown files. Skills are markdown files with scripts. Tools are TypeScript or Python. Commands are markdown files with frontmatter. Memory is markdown in a directory. Integrations are authenticated skills with CLI scripts. Code and text — all the way down.

This means the base layer is human-readable, git-trackable, grep-searchable. You can inspect any agent's instructions, read any memory file, modify any skill, add any tool. There is no magic. There is no hidden state. The entire system is transparent and hackable.

But it's a full computer. If an agent needs a SQLite database, it creates one. If it needs PostgreSQL, it installs it. If it needs a vector store for semantic search, it spins one up. If it needs Redis for caching, it runs it. The filesystem is the foundation — not the ceiling. The agent has root access to a full Linux machine with the entire software ecosystem available. Whatever it needs, it installs and uses.

And because everything is just files, an agent can create anything:

- An agent can write a new agent definition and it exists.
- An agent can write a Python script, make it executable, and schedule it with cron.
- An agent can create a new skill by writing a SKILL.md and a script directory.
- An agent can build a new tool, register it, and start using it in the same session.
- An agent can modify its own instructions to get better at its job.

The computer builds itself.

---

## The Five Pillars

### Total Connectivity

Every tool, every API, every data source you use — connected with full authenticated access. Your GitHub repos. Your Cloudflare zones. Your AWS infrastructure. Your Vercel deployments. Your Slack workspace. Your LinkedIn. Your Gmail. Your Google Drive. Your banking in Mercury. Your legal in Firstbase. Your payroll in Deel. Your tasks in Linear. Your social in X. Your domains in Namecheap.

All of it wired in. All of it queryable. All of it actionable. You chat with your Kortix instance and it can pull data from any system, push changes to any system, and cross-reference information across all of them. One AI cortex that spans your entire digital footprint.

### Perfect Memory

Four-tier persistent memory that grows over time:

- **Core memory** — loaded every session. Who the agent is, who you are, what the project is, what's in progress right now.
- **Long-term memory** — decisions, learnings, preferences, contacts. Retrieved on demand. Never lost.
- **Episodic memory** — session journals. What happened, when, what was learned. A complete history of every interaction.
- **Knowledge base** — research outputs, reference material, accumulated expertise. The agent's library.

The agent also has full access to its own session history — every past conversation, every tool call, every result. It can search its own history, recall past approaches, and build on previous work. Nothing is ever truly out of context.

The longer a Kortix instance runs, the more it knows. It compounds. Day one, it's a capable agent. Day thirty, it understands your entire operation. Day three hundred, it knows things about your business that you've forgotten.

### Autonomous Workers

This is the core of it. Agents aren't chatbots — they're workers.

A Kortix agent runs code. It executes shell commands. It writes scripts. It hits APIs. It installs packages. It builds applications. It deploys services. It creates files, edits files, deletes files. It operates with the full power of a human developer sitting at a terminal — except it can run continuously, in parallel, without breaks.

You can spin up a worker that reviews every pull request on your GitHub org. Another that processes incoming invoices from email and logs them in your accounting system. Another that monitors your infrastructure and pages you if something breaks. Another that writes and publishes your weekly newsletter from your notes. Another that handles customer support emails with full context of your product.

Each worker is just an agent definition — a markdown file with instructions and permissions. Creating a new worker is as easy as writing a document that describes what it should do. The framework handles the rest.

An agent can create other agents. An agent can build a new tool it needs, write the integration, and start using it — all in one session. The workforce grows itself.

### Always On

Kortix doesn't wait for you to type a message. It runs.

Scheduled triggers fire agents on cron — every morning, every Monday, every first of the month. Event-based triggers fire on webhooks — a new PR opened, a payment received, an email arrived, a deploy failed. Background workers run continuously — monitoring, processing, reacting.

While you sleep, your Kortix instance is working. It processed overnight emails, flagged what matters, auto-replied to routine ones. It reviewed and merged PRs that passed CI. It generated your weekly report. It posted your scheduled content. It renewed an expiring domain. You wake up to a scratchpad that says: here's what happened.

### Everywhere at Once

You reach your Kortix instance wherever you already are. Chat interface. Email. Slack. WhatsApp. SMS. Telegram. Microsoft Teams.

It's not a single app you have to open. It's a presence across all your communication channels. Message it on WhatsApp from your phone. Email it a document to process. Tag it in a Slack thread to research something. It's always there, always in context, always ready.

---

## A Company in a Computer

One person with a Kortix instance has the operational capacity of a team.

The agents handle email, code, deployments, finance, content, legal, research, data analysis, customer communication, infrastructure. Each agent has access to the full system — every integration, every memory file, every tool. They coordinate through the filesystem. They build on each other's work.

This is not hypothetical. The architecture supports it today. An agent can:

- Write a Python automation, schedule it, and let it run forever
- Build a full-stack web application from scratch, test it, deploy it
- Research a topic for hours, produce a cited report, save it to the knowledge base
- Draft legal documents, generate invoices, send emails, file paperwork
- Monitor competitors, analyze markets, generate strategy briefs
- Manage your entire cloud infrastructure — domains, DNS, servers, deployments

Creating a new capability is writing a skill. Creating a new worker is writing an agent. Creating a new automation is writing a command or a trigger. It's all just text files that become operational.

A living, breathing company inside a computer. It grows with you.

---

## What Exists Today

The foundation is built. A Kortix instance is a Docker-based sandbox running a full KDE desktop with the OpenCode agent framework. Inside it:

- **7 agents** — one primary orchestrator plus specialists for research, browser automation, web development, presentations, spreadsheets, and image generation
- **12 skills** — persistent memory, deep research, browser automation (agent-browser), email (agent's own inbox), documents (DOCX, PDF, XLSX), presentations, video (Remotion), text-to-speech (ElevenLabs), skill creation
- **6 custom tools** — web search, web scraping, image search, image generation, video generation, presentation generation
- **10 slash commands** — memory bootstrap, project init, journaling, research, email, presentations, spreadsheets, memory search/forget
- **4-tier memory system** — core, long-term, episodic, knowledge — all filesystem-based, all persistent
- **Session history access** — full access to past conversations, searchable and queryable
- **4 background services** — OpenCode web UI, presentation viewer, browser viewport stream (WebSocket), browser viewer UI
- **Real email identity** — the agent has its own inbox, sends and receives email as itself

The agent framework is OpenCode — open-source, provider-agnostic, with a TUI and web interface. It supports MCP (Model Context Protocol) for external tool integration, custom agents with granular permissions, custom tools in TypeScript/Python, and a plugin system for extensibility. Sessions are stored on disk and accessible programmatically via the OpenCode SDK.

---

## Where It's Going

**Unified integration layer.** Every SaaS tool connected through a single, agnostic auth system. OAuth, API keys, CLI tokens — managed centrally, accessible by any agent, any tool, any script. Connect once, use everywhere.

**Trigger system.** Cron-based and event-based triggers that fire agents automatically. Webhooks, schedules, filesystem watchers, email listeners. The infrastructure for always-on operation.

**Communication channels.** WhatsApp, Slack, SMS, Teams, Telegram, email — all wired as input/output channels. The agent is reachable everywhere the user already communicates.

**SDK.** Programmatic access to the full Kortix instance. Create sessions, send prompts, subscribe to events, inject context — from any application, any language, any platform. Build products on top of Kortix.

**Self-improving agents.** Agents that monitor their own performance, identify gaps in their skills, and build new tools and automations to fill them. The compounding flywheel at the system level.

---

## Principles

**Will over skill.** The agent doesn't need to know how to do something to do it. It just needs to be willing to figure it out. And it always is.

**Filesystem as foundation.** The base layer is files — human-readable, git-trackable, grep-searchable. No hidden state. No black boxes. But the agent has a full computer. If it needs a database, it runs one.

**Memory over repetition.** Learn once, remember forever. The agent never asks the same question twice. Every correction makes it permanently better.

**Context is everything.** The biggest unlock isn't a smarter model — it's a model that can see everything it needs to see. Kortix is a context engineering machine.

**Everything is code and text.** Agents, skills, tools, commands, memory, integrations — all text files that become operational. Anyone can read them, edit them, create them.

**The agent that builds itself.** An agent can create agents, build tools, write skills, schedule automations. The system extends itself. The computer grows.

**An AI company of one.** One person. One Kortix instance. The operational capacity of an entire team. That's the end state.
