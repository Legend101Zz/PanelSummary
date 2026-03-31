# 📚⚡ PanelSummary — Books as Manga. Knowledge as Reels.

> Turn any PDF into swipeable manga panels and TikTok-style lesson reels.

---

## 🏗️ Architecture Design & Flaw Analysis

### What We're Building
PanelSummary is a **full-stack web app** that does this:

```
Your PDF → Backend Parses It → AI Summarizes It → Manga Panels + Reels
```

### Architecture Map

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER (Next.js 15)                                           │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │  Upload  │  │ Manga Reader │  │    Reels Feed          │   │
│  │  Page    │  │ (swipe horiz)│  │ (vertical + horiz)     │   │
│  └──────────┘  └──────────────┘  └────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼─────────────────────────────────────┐
│  FASTAPI BACKEND                                                │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ /upload  │  │ /books/{id}  │  │  /reels  /manga        │   │
│  │ endpoint │  │ status poll  │  │  generation endpoints  │   │
│  └────┬─────┘  └──────────────┘  └────────────────────────┘   │
│       │ push job                                               │
│  ┌────▼─────────────────────────────────────────────────────┐  │
│  │  CELERY WORKER (background jobs)                         │  │
│  │  1. parse_pdf_task  → Docling + PyMuPDF                 │  │
│  │  2. summarize_task  → OpenAI/OpenRouter API              │  │
│  │  3. manga_task      → panel JSON generation             │  │
│  │  4. reels_task      → reel script generation            │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
  ┌─────▼─────┐      ┌──────▼─────┐    ┌───────▼──────┐
  │  MongoDB   │      │   Redis    │    │   GridFS     │
  │ (main DB)  │      │  (queue +  │    │  (PDF images)│
  │  Beanie ODM│      │   cache)   │    │              │
  └────────────┘      └────────────┘    └──────────────┘
```

### Stack Decisions (with reasoning)

| Layer | Tool | Why |
|-------|------|-----|
| PDF Parsing | Docling + PyMuPDF | Docling (IBM) gives structured JSON with chapters; PyMuPDF extracts images at high fidelity |
| Background Jobs | Celery + Redis | PDF parsing takes 30-120 seconds — we can't block the HTTP request |
| Database | MongoDB + Beanie | JSON-native = perfect for `canonical_book` and `canonical_summary` documents |
| Image Store | GridFS (inside MongoDB) | Keeps images co-located with book data; no extra S3 needed for MVP |
| LLM | User's own key | Zero cost for us; supports OpenAI + OpenRouter (100+ models) |
| Frontend | Next.js 15 App Router | Server components = fast initial loads; client components = smooth animations |
| Animations | Motion.dev (Framer) | Best drag gesture + spring physics library in 2026 |
| State | Zustand | Lightweight; no redux boilerplate |
| Styling | Tailwind + custom CSS | Utility classes + manga-specific custom properties |

### ⚠️ Beginner Pitfalls We Pre-Solved

1. **"Why does upload feel slow?"** → Celery moves parsing OFF the main thread. Upload returns immediately with a `job_id`. Frontend polls `/status/{job_id}`.
2. **"Why do I keep re-parsing the same PDF?"** → SHA-256 hash of the PDF checked before any work starts. Same book = instant cache hit.
3. **"I ran out of API credits!"** → Everything derived from ONE canonical summary JSON. Manga + reels both read from that cache — LLM called ONCE per chapter.
4. **"Images look bad in manga panels"** → PyMuPDF renders at 2x DPI, stored in GridFS, served via `/images/{id}` endpoint with proper caching headers.
5. **"The reels freeze on mobile"** → Motion.dev `useScroll` + CSS `scroll-snap` (not JS scroll) for buttery 60fps.

---

## 📖 Complete README — Every Step Explained

### What You Need Before Starting

You need 4 things installed on your computer:
1. **Docker Desktop** — runs all the services (database, cache, backend) in containers
2. **Node.js 20+** — runs the frontend
3. **Git** — to clone/manage code (already have the folder)
4. **A terminal** — on Mac, press `Cmd+Space` and type "Terminal"

### Step 1: Install Docker Desktop
- Go to https://www.docker.com/products/docker-desktop/
- Download for Mac (Apple Silicon if M1/M2/M3, Intel if older Mac)
- Install and open it — you should see the whale icon in your menu bar
- **What it does**: Docker runs software in isolated "containers" so you don't have to install Python, MongoDB etc. manually

### Step 2: Install Node.js
- Go to https://nodejs.org/
- Download the "LTS" version (the one with "Recommended for Most Users")
- Install it
- **What it does**: Node.js lets you run JavaScript on your computer (needed for Next.js frontend)

### Step 3: Get Your API Keys

#### 🔑 API Keys You Need & How to Get Them

**Option A: OpenAI (Recommended for beginners)**
1. Go to https://platform.openai.com/signup
2. Create a free account (you get $5 free credits)
3. Go to https://platform.openai.com/api-keys
4. Click "Create new secret key"
5. Copy it — it looks like `sk-proj-abc123...`
6. **KEEP IT SECRET** — never share it or commit it to git

**Option B: OpenRouter (More model choices, often cheaper)**
1. Go to https://openrouter.ai/
2. Sign up with Google or email
3. Go to https://openrouter.ai/keys
4. Click "Create Key"
5. Add $5 credit (minimum) — many models cost fractions of a cent
6. Copy key — it looks like `sk-or-v1-abc123...`

**Which to use?** Start with OpenAI if you're confused. Switch to OpenRouter later for cheaper/better models.

### Step 4: Set Up Environment Variables

Environment variables are like a secret config file that tells the app your API keys and settings WITHOUT hardcoding them in the code.

Create a file called `.env` in the `backend/` folder:

```bash
# backend/.env
MONGODB_URL=mongodb://mongo:27017
REDIS_URL=redis://redis:6379
SECRET_KEY=change-this-to-a-random-string-like-abc123xyz789
CORS_ORIGINS=http://localhost:3000
```

Create a file called `.env.local` in the `frontend/` folder:

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Why two files?** Backend secrets stay on the server. Frontend variables (prefixed `NEXT_PUBLIC_`) are safe to expose to browsers.

**The LLM key is NOT stored here** — the user enters it in the UI each session. This is intentional: we never store your API key.

### Step 5: Run the App

```bash
# In the project root (Book-Reel folder)
docker-compose up --build
```

This command:
1. Builds the Python backend container (~3 minutes first time)
2. Starts MongoDB (your database)
3. Starts Redis (your job queue)
4. Starts Celery worker (background PDF processor)

Then in a NEW terminal tab:

```bash
cd frontend
npm install       # installs all JavaScript packages (~2 minutes first time)
npm run dev       # starts the Next.js development server
```

Open your browser to **http://localhost:3000** 🎉

### Step 6: Using the App

1. Open http://localhost:3000
2. Click the upload zone and drag a PDF book onto it
3. Wait for parsing (progress bar shows status)
4. Once parsed, click "Generate Summary" and enter your LLM API key
5. Choose your style (Manga / Noir / Academic / etc.)
6. Wait for generation (~1-2 minutes per chapter)
7. Explore the Manga Reader or the Reels Feed!

### Step 7: Deploy to Production (Optional)

**Easiest path for beginners:**
1. Backend → Railway.app (drag and drop Docker)
2. Frontend → Vercel.com (connects to GitHub, auto-deploys)
3. MongoDB → MongoDB Atlas free tier (https://www.mongodb.com/atlas)
4. Redis → Upstash free tier (https://upstash.com/)

---

## 📁 Folder Layout — Every File Explained

```
Book-Reel/
│
├── docker-compose.yml      ← Starts MongoDB + Redis + Backend together
├── README.md               ← This file!
│
├── backend/
│   ├── Dockerfile          ← Instructions to build Python container
│   ├── requirements.txt    ← All Python packages needed
│   └── app/
│       ├── main.py         ← FastAPI app: all HTTP endpoints
│       ├── models.py       ← MongoDB document schemas (Beanie ODM)
│       ├── config.py       ← Environment variables loader
│       ├── pdf_parser.py   ← PDF → canonical_book JSON (Docling + PyMuPDF)
│       ├── llm_client.py   ← Sends prompts to OpenAI/OpenRouter
│       ├── prompts.py      ← All LLM system prompts (style-aware)
│       ├── generate_manga.py  ← canonical_summary → manga panels JSON
│       ├── generate_reels.py  ← canonical_summary → reel scripts JSON
│       └── celery_worker.py   ← Background task definitions
│
└── frontend/
    ├── Dockerfile          ← Instructions to build Next.js container
    ├── package.json        ← All JavaScript packages needed
    ├── tailwind.config.ts  ← Tailwind CSS customization (manga colors)
    ├── next.config.ts      ← Next.js configuration
    │
    ├── app/                ← Next.js App Router pages
    │   ├── layout.tsx      ← Root layout (fonts, global styles)
    │   ├── page.tsx        ← Home/landing page
    │   ├── globals.css     ← Global CSS (manga variables, animations)
    │   ├── upload/
    │   │   └── page.tsx    ← PDF upload page
    │   ├── books/[id]/
    │   │   ├── page.tsx    ← Book detail + status page
    │   │   └── manga/
    │   │       └── page.tsx ← Manga reader page
    │   └── reels/
    │       └── page.tsx    ← Reels feed page
    │
    ├── components/
    │   ├── MangaReader.tsx ← Horizontal swipe manga panel viewer
    │   ├── ReelsFeed.tsx   ← Vertical + horizontal dual-swipe reels
    │   ├── ReelCard.tsx    ← Single reel card with animations
    │   ├── UploadZone.tsx  ← Drag-and-drop PDF upload
    │   ├── BookCard.tsx    ← Book preview card
    │   ├── StyleSelector.tsx ← "Choose your style" modal
    │   ├── ApiKeyModal.tsx ← LLM key entry modal
    │   └── StatusPoller.tsx ← Job progress display
    │
    └── lib/
        ├── api.ts          ← All API call functions
        ├── store.ts        ← Zustand global state
        └── types.ts        ← TypeScript type definitions
```

---

## 🔧 What I Did, How I Did It, Why

### Decision Log

**1. Why Docling for PDF parsing?**
Docling is IBM's open-source PDF understanding library released in 2024. Unlike simple PDF readers, it understands document STRUCTURE — it knows what's a heading vs body text vs caption vs table. This is crucial for extracting chapters correctly. We pair it with PyMuPDF for high-quality image extraction because Docling's image handling is weaker.

**2. Why MongoDB instead of PostgreSQL?**
Our data (`canonical_book`, `canonical_summary`, `manga_panels`) is deeply nested JSON. Storing nested JSON in SQL requires many tables and joins. MongoDB stores it naturally as documents. The structure changes as we add features (no migration scripts needed).

**3. Why Celery + Redis instead of background threads?**
PDF parsing with Docling can take 60-120 seconds for large books. If we did this in the main FastAPI process, the server would freeze for ALL users during that time. Celery sends the job to a separate worker process via Redis. The user gets an immediate response with a `job_id` and polls for progress.

**4. Why user-provided LLM keys?**
Simple: we don't pay for your API calls. You control your costs. The key is sent with each request and never stored on our server (not even in logs — we're careful about this).

**5. Why "canonical summary" as the single source of truth?**
We call the LLM ONCE per chapter to generate a rich `canonical_summary`. From that, BOTH manga panels AND reel scripts are derived with separate (cheaper) calls. This means if you want to regenerate manga in a different style, we skip re-summarizing and just re-panelize. Huge cost savings.
