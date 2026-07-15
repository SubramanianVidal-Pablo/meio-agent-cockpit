# MEIO Agent Cockpit — Handoff Guide

A biopharma supply chain planning cockpit with AI-assisted scenario planning, built on React + Vite + Tailwind, deployed on Vercel, and powered by the Anthropic Claude API.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository & Access](#2-repository--access)
3. [Local Setup](#3-local-setup)
4. [API Key Setup](#4-api-key-setup)
5. [Project Structure](#5-project-structure)
6. [Deploying to Vercel](#6-deploying-to-vercel)
7. [Making & Deploying Changes](#7-making--deploying-changes)
8. [Key Files to Know](#8-key-files-to-know)
9. [Common Tasks](#9-common-tasks)
10. [Contacts & Credentials](#10-contacts--credentials)

---

## 1. Project Overview

The cockpit has four main tabs:

| Tab | What it does |
|-----|-------------|
| **Operations Review** | Live inventory positions, stockout exposure, decisions queue |
| **Planning View** | MEIO safety stock recommendations, portfolio scatter chart, SKU-level adjustments |
| **Continuous Improvement** | Demand signal, lead time, and network optimization deep-dives |
| **Scenario Planning** | AI chatbot (Claude) for supply chain scenario simulation and trade-off analysis |

All data is currently static/mock — no backend database. The only live external call is to the Anthropic Claude API for the Scenario Planning chatbot.

---

## 2. Repository & Access

**GitHub repo:** https://github.com/SubramanianVidal-Pablo/meio-agent-cockpit

**Live deployment:** https://meio-agent-cockpit.vercel.app (check Vercel dashboard for exact URL)

To give a new team member push access:
1. Go to the GitHub repo → **Settings** → **Collaborators**
2. Click **Add people** → enter their GitHub username
3. They accept the invite via email

---

## 3. Local Setup

Prerequisites: **Node.js 18+** and **Git** installed.

> **Corporate network / SSL issue?** If `npm install` fails with an SSL error, run this first:
> ```bash
> npm config set strict-ssl false
> ```
> This is commonly needed on BCG or other corporate networks that use SSL inspection.

```bash
# 1. Clone the repo
git clone https://github.com/SubramanianVidal-Pablo/meio-agent-cockpit.git
cd meio-agent-cockpit

# 2. Install dependencies
npm install

# 3. Add your API key (see Section 4 below)

# 4. Start the local dev server
npm run dev
```

Open http://localhost:5173 in your browser. Changes to source files hot-reload automatically.

---

## 4. API Key Setup

The Scenario Planning chatbot requires an **Anthropic API key**.

### For local development

Create a file called `.env.local` in the project root (this file is gitignored — never commit it):

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxx
```

Then restart `npm run dev`.

### For Vercel (production)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → select the `meio-agent-cockpit` project
2. **Settings** → **Environment Variables**
3. Add: `ANTHROPIC_API_KEY` = your key → **Save**
4. Redeploy for the change to take effect (push any commit, or click Redeploy)

### Getting an API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in → **API Keys** → **Create Key**
3. Copy the key immediately — it's only shown once
4. The project uses **Claude Opus 4.7** by default (`claude-opus-4-7`)

---

## 5. Project Structure

```
meio-agent-cockpit/
├── api/
│   └── anthropic.js          # Vercel serverless function — proxies Claude API calls
│                             # (keeps the API key server-side, never exposed to browser)
├── src/
│   ├── api/
│   │   └── claude.js         # Client-side fetch wrapper that calls /api/anthropic
│   ├── components/
│   │   ├── OperationsDashboard.jsx   # Operations Review tab
│   │   ├── PlanningView.jsx          # Planning View tab (largest file)
│   │   ├── ScenarioWorkspace.jsx     # Scenario Planning chatbot + KPI extraction
│   │   ├── SimulationChat.jsx        # Scenario library orchestrator
│   │   ├── ScenarioLibrary.jsx       # Scenario list/card view
│   │   └── ContinuousImprovement.jsx # CI Opportunities tab
│   ├── data/
│   │   └── skuData.js         # All mock SKU data and ABC classification logic
│   ├── App.jsx                # Root component, tab routing
│   └── main.jsx               # React entry point
├── .env.local                 # LOCAL ONLY — API key (gitignored, never commit)
├── vercel.json                # Vercel routing config (API proxy + SPA fallback)
├── package.json
└── vite.config.js
```

---

## 6. Deploying to Vercel

### Connect a new Vercel account to the repo

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import from GitHub → select `meio-agent-cockpit`
3. Framework: **Vite** (auto-detected)
4. Add environment variable: `ANTHROPIC_API_KEY`
5. Click **Deploy**

That's it. Vercel handles the build (`npm run build`) and serves the output.

### Auto-deploy

Every push to `main` automatically triggers a new production deployment. No manual steps needed once it's connected.

---

## 7. Making & Deploying Changes

```bash
# Pull latest changes before starting work
git pull origin main

# Make your edits in src/ ...

# Stage and commit
git add src/components/YourFile.jsx
git commit -m "Short description of what changed"

# Push — Vercel deploys automatically within ~1 minute
git push origin main
```

Check deployment status at: https://vercel.com/dashboard → `meio-agent-cockpit` → **Deployments**

---

## 8. Key Files to Know

### `src/data/skuData.js`
All product/SKU mock data lives here. To add or change SKUs, inventory levels, lead times, or ABC class inputs — edit this file. The rest of the app derives from it.

### `src/components/PlanningView.jsx`
The largest and most complex file. Contains:
- `DECISIONS_DATA` — the decisions queue shown in Operations Review
- `CI_LEVERS` — the Continuous Improvement opportunity cards and deep-dives
- All MEIO safety stock calculation logic
- Portfolio scatter chart

### `src/components/ScenarioWorkspace.jsx`
The AI chatbot component. Key functions:
- `buildSystemPrompt(skus)` — dynamically constructs the Claude system prompt from live SKU data. Edit this to change what context the AI has.
- `buildKpiExtractionPrompt(skus)` — prompt used at save-time to extract KPIs from the conversation.
- `computeVariantKPIs(skus)` — core inventory KPI calculation, exported and used across tabs.

### `api/anthropic.js`
Vercel serverless function that forwards requests to Anthropic. The `ANTHROPIC_API_KEY` env var is read here. If the Claude model needs to change, update the model string here.

---

## 9. Common Tasks

**Change the Claude model**
In `api/anthropic.js`, find the `model:` field and update it. Current: `claude-opus-4-7`.

**Add a new SKU**
Edit `src/data/skuData.js` — add an entry to the `SKU_MASTER` array following the existing pattern. The app will pick it up automatically.

**Change safety stock targets or service level floors**
In `src/components/ScenarioWorkspace.jsx`, edit `SERVICE_TARGETS`. In `src/components/PlanningView.jsx`, search for `MEIO_RANGE_MIN_MULT` / `MEIO_RANGE_MAX_MULT` for the portfolio band.

**Change the AI chatbot's behaviour**
Edit `buildSystemPrompt()` in `ScenarioWorkspace.jsx`. The function already injects live SKU data, portfolio KPIs, and service level floors — extend or adjust as needed.

**Update mock financial figures**
Search for `DECISIONS_DATA` in `PlanningView.jsx` for the decisions queue numbers. SKU-level inventory values derive from `skuData.js`.

---

## 10. Contacts & Credentials

To pick up this project in Claude Code, open the folder and start with: *"Read `src/components/PlanningView.jsx`, `src/components/OperationsDashboard.jsx`, `src/components/ScenarioWorkspace.jsx`, and `src/data/skuData.js`, then [describe your change]."* — or drag those four files directly into the chat.

| What | Where |
|------|-------|
| GitHub repo | https://github.com/SubramanianVidal-Pablo/meio-agent-cockpit |
| Vercel project | https://vercel.com/dashboard (log in with the account that owns the project) |
| Anthropic Console (API keys) | https://console.anthropic.com |
| API key | Share securely — do **not** put in this file or commit to git |

> **Security note:** Never commit `.env.local` or any file containing `ANTHROPIC_API_KEY` to the repository. The `.gitignore` already excludes `.env.local` — keep it that way.
