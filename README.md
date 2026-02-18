# HR Budget Planner

Sistema web para gestão de orçamento de folha de pagamento com controle de vagas e offer gate.

## 🚀 Quick Start

### With Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# Wait for services to start, then access:
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Manual Setup

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -e ".[dev]"

# Start PostgreSQL (Docker)
docker run -d --name hrbudget-db \
  -e POSTGRES_USER=hrbudget \
  -e POSTGRES_PASSWORD=hrbudget123 \
  -e POSTGRES_DB=hrbudget \
  -p 5432:5432 \
  postgres:16-alpine

# Run migrations
alembic upgrade head

# Seed data
python -m scripts.seed

# Start server
uvicorn app.main:app --reload
```

#### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

## 🔑 Demo Credentials

| Role    | Email              | Password    |
|---------|-------------------|-------------|
| Admin   | admin@example.com  | password123 |
| Manager | manager@example.com | password123 |

## 📊 Features

### Dashboard
- Budget summary by month with health status (🟢 green, 🟡 yellow, 🔴 red)
- Approved vs Baseline vs Committed comparison
- Pipeline potential alerts

### Requisitions
- Create and manage job requisitions
- Priority levels (P0-P3)
- Status workflow (Draft → Open → Interviewing → Offer Pending → Filled)
- Candidate ready flag

### Offer Gate ⭐ (Main Screen)
- Approve/hold offers with real-time budget impact preview
- Multi-select offers to see combined impact
- Bottleneck detection (first month to go RED)
- What-if simulation for hypothetical positions

### Admin
- Job catalog management
- User management (ADMIN/MANAGER roles)
- Audit logs with full change history

## 🧮 Budget Engine

Core calculation:

```
Remaining = Approved - Baseline - Committed

Where:
- Approved = Budget approved for the month
- Baseline = Actual (if exists) OR Forecast (if exists) OR 0
- Committed = Sum of ACCEPTED offers with pro-rata applied
```

### Pro-rata Formula

```
Pro-rata = (Days in month - Start day + 1) / Days in month
```

Example: Start on Jan 15 (31-day month) = 17/31 ≈ 0.548

### Health Status

- 🟢 GREEN: Remaining ≥ 20% of Approved
- 🟡 YELLOW: 0 < Remaining < 20% of Approved  
- 🔴 RED: Remaining ≤ 0

## 🏗️ Tech Stack

| Layer    | Technology                            |
|----------|--------------------------------------|
| Backend  | Python 3.11+ / FastAPI / Pydantic v2 |
| ORM      | SQLAlchemy 2.0 + Alembic             |
| Database | PostgreSQL 16                        |
| Frontend | React 18 + Vite + TypeScript         |
| Styling  | Tailwind CSS                         |
| Auth     | JWT (access + refresh tokens)        |
| Infra    | Docker + docker-compose              |

## 🧪 Testing

```bash
cd backend

# Run tests
pytest

# With coverage
pytest --cov=app --cov-report=html
```

## 🌐 Remote Access (Cloudflare Tunnel)

```bash
# Free tunnel, no account needed
cloudflared tunnel --url http://localhost:3000

# Result: https://random-name.trycloudflare.com
```

## 📁 Project Structure

```
hr-budget-planner/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   ├── services/
│   │   │   └── budget_engine.py  # CORE
│   │   └── middleware/
│   ├── tests/
│   └── scripts/
│       └── seed.py
└── frontend/
    └── src/
        ├── api/
        ├── components/
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── Requisitions.tsx
        │   ├── OfferGate.tsx  # MAIN SCREEN
        │   └── Admin.tsx
        ├── stores/
        └── types/
```

## 📝 API Documentation

Once running, access Swagger UI at: http://localhost:8000/docs

### Key Endpoints

```
POST /api/auth/login
GET  /api/auth/me

GET  /api/org-units/{id}/summary

GET  /api/requisitions
POST /api/requisitions

GET  /api/offers
POST /api/offers/preview-impact
POST /api/offers/{id}/approve

GET  /api/admin/audit-logs
```

## 🔒 RBAC

| Role    | Permissions                                  |
|---------|---------------------------------------------|
| ADMIN   | Full access: users, org units, approvals    |
| MANAGER | Create/edit own requisitions, propose offers |

## License

MIT
