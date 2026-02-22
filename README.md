<h1 align="center">💼 HR Budget Planner</h1>

<p align="center">
  <strong>Stop guessing your headcount budget. Start controlling it.</strong>
</p>

<p align="center">
  <a href="#-what-it-does">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License" />
  <img src="https://img.shields.io/badge/python-3.11+-green" alt="Python" />
  <img src="https://img.shields.io/badge/react-18-blue" alt="React" />
  <img src="https://img.shields.io/badge/fastapi-async-teal" alt="FastAPI" />
  <img src="https://img.shields.io/badge/PT--BR-traduzido-yellow" alt="PT-BR" />
</p>

---

You know the problem: play it safe and leftover budget gets clipped next quarter. Overshoot and you're making painful cuts. HR Budget Planner sits right in the middle — letting you run a full recruiting pipeline while keeping a tight grip on when offers actually go out.

## ✨ What it does

🟢 **Budget vs Actuals** — See approved budget and actual spend side by side, every month, at a glance.

📊 **Stacked Chart** — One chart tells the whole story: what's allocated, what's available, what's simulated, and what's over budget (red = stop).

🧮 **Hire Simulator** — Pick a role from your catalog, choose a start month, and instantly see the budget impact from that month forward. Stack multiple simulations. No spreadsheets.

📋 **Offer Prioritization** — When you have more candidates than budget, check the ones you want to approve and watch the chart update in real time. Make trade-offs with data, not gut feeling.

⚙️ **Inline Editing** — Click any budget or actual value to edit it directly in the table. No separate admin screens needed.

📝 **Audit Trail** — Every change is logged. Who changed what, when, and why.

🌐 **Fully translated to PT-BR** — Interface 100% em português brasileiro.

## 👥 Who is this for

- **Tech/Engineering managers** who own a headcount budget
- **HR Business Partners** who need to track budget consumption
- **Finance teams** who want visibility into planned vs actual spend
- **Anyone** tired of managing headcount planning in spreadsheets

## 🚀 Quick Start

```bash
git clone https://github.com/idiogo/hr-budget-planner.git
cd hr-budget-planner
docker-compose up -d
```

Open [localhost:3000](http://localhost:3000) and log in with the seeded accounts.

### Without Docker

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install
npm run dev -- --host --port 3000
```

Requires PostgreSQL 16+.

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11+ · FastAPI (async) · SQLAlchemy 2.0 · Alembic |
| **Frontend** | React 18 · Vite · TypeScript · Tailwind CSS · Recharts |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (access + refresh tokens) |
| **Infra** | Docker · docker-compose |

## 📐 Architecture

```
hr-budget-planner/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Budget engine (core logic)
│   │   └── middleware/       # Auth + Audit
│   ├── alembic/             # Database migrations
│   ├── scripts/seed.py      # Sample data
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/           # Dashboard, Requisitions, Offers, Admin
│   │   ├── components/      # Reusable UI components
│   │   ├── api/             # API client
│   │   └── types/           # TypeScript types
│   └── vite.config.ts
└── docker-compose.yml
```

### Budget Engine

The core calculation lives in `backend/app/services/budget_engine.py`:

```
Remaining = Approved Budget - Baseline (Actual or Forecast) - Committed (Accepted Offers)
```

- **Pro-rata**: hires starting mid-month are calculated proportionally
- **Overhead multiplier**: configurable per org unit (e.g. 1.8x for benefits/taxes)
- **Health status**: 🟢 Green (≥20% remaining) · 🟡 Yellow (<20%) · 🔴 Red (over budget)
- **Impact preview**: simulate approving N offers and see the effect on every future month

### API

Full Swagger docs at `/docs` when running the backend.

Key endpoints:

```
POST /api/auth/login
GET  /api/org-units/{id}/summary
GET  /api/org-units/{id}/budgets
GET  /api/org-units/{id}/actuals
GET  /api/job-catalog
GET  /api/requisitions
GET  /api/offers
POST /api/offers/preview-impact
```

## 🚢 Deploy

### Docker

```bash
docker-compose up -d
```

### Fly.io

```bash
fly launch --name hr-budget
fly postgres create --name hr-budget-db --region gru
fly postgres attach hr-budget-db --app hr-budget
fly secrets set SECRET_KEY="$(openssl rand -hex 32)" --app hr-budget
fly deploy
```

## 🗺️ Roadmap

- [ ] CSV/Excel import for budgets and actuals
- [ ] Forecast management (dissídio/collective agreements)
- [ ] Turnover simulation (what if someone leaves?)
- [ ] Slack notifications when a month goes yellow/red
- [ ] PDF/Excel report export
- [ ] ATS integration (Greenhouse, Lever)
- [ ] HRIS integration (Workday, SAP)
- [ ] Multi-currency support

## 📄 License

This project is dual-licensed:

- **[AGPL-3.0](LICENSE)** — Free for open-source use. If you modify and deploy it as a network service, you must open-source your changes.
- **[Commercial License](https://idiogo.gumroad.com/l/hr-budget-planner)** — For closed-source/proprietary use, purchase a license to use without AGPL obligations.

## 🤝 Contributing

Contributions are welcome under the AGPL-3.0 license. Please open an issue first for major changes.

---

<p align="center">
  Built by <a href="https://github.com/idiogo">@idiogo</a>
</p>
