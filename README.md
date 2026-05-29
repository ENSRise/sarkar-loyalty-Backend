# Loyalty Sarkar — Backend

Node.js / Express REST API powering the Loyalty Sarkar program. Manages customers, orders, tier upgrades, referrals, and Shopify integration.

---

## Tech Stack

| Layer | Library |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 5 |
| ORM | Sequelize 6 |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken) |
| Shopify | GraphQL Admin API 2025-04 |
| Transpiler | Babel (ES modules in source) |

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your database credentials and Shopify token
```

### 3. Run migrations
```bash
npm run db:migrate
```

### 4. Start development server
```bash
npm run dev        # nodemon + babel-node (hot reload)
```

### 5. Build & start for production
```bash
npm run build      # compiles src/ → dist/
npm start          # runs dist/server.js
```

---

## Environment Variables

See `.env.example` for a full list. Key variables:

| Variable | Description |
|---|---|
| `DB_*` | PostgreSQL connection details |
| `PORT` | HTTP port (default `3000`) |
| `JWT_SECRET` | Secret used to sign admin tokens |
| `shopName` | Your `*.myshopify.com` handle |
| `accessToken` | Shopify Admin API token (`shpat_…`) |
| `SilverReferralPoint` | Wallet points awarded per Silver referral |
| `GoldReferralPoint` | Wallet points awarded per Gold referral |
| `PlatinumReferralPoint` | Wallet points awarded per Platinum referral |

---

## API Routes

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Admin login |
| POST | `/api/auth/register` | Public | Register new admin |

### Customers
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/customers` | JWT | List all customers (paginated) |
| GET | `/api/customers/:id` | JWT | Customer detail |
| GET | `/api/customers/:id/orders` | JWT | Customer orders |
| POST | `/api/customers/register` | Public | Enrol customer from storefront |
| GET | `/api/customers/export` | JWT | Export CSV / PDF |

### Orders / Webhooks
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/orders/credit` | Public | Credit order spend (Shopify webhook) |
| POST | `/api/webhooks/orders/paid` | HMAC | Shopify order paid webhook |

### Referral
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/referral/submit` | Public | New customer joins via referral link |
| GET | `/api/referral/stats` | JWT | Referral leaderboard & stats |

### Settings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/settings` | JWT | Get app settings |
| PUT | `/api/settings` | JWT | Update app settings |

### Tier Info
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tier-info` | JWT | Get tier configuration |
| POST | `/api/tier-info` | JWT | Create / update tier config |

### Users & Roles
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | JWT | List admin users |
| POST | `/api/users` | JWT | Create admin user |
| GET | `/api/roles` | JWT | List roles |
| POST | `/api/roles` | JWT | Create / update role |

---

## Database Migrations

```bash
npm run db:migrate          # run all pending migrations
npm run db:migrate:undo     # undo last migration
npm run db:seed             # run seeders
```

---

## Tier Logic

Customers are automatically promoted when their `totalSpent` crosses the threshold defined in `TierInfo`:

| Tier | Default threshold |
|---|---|
| Silver | ₹0 (entry) |
| Gold | ₹1,000 |
| Platinum | ₹5,000 |

Tier upgrades sync a note to the Shopify customer record in the format:
```
Tier: Gold | Reward: 15% | Additional Benefits: benefit1 COUPON,PHONE ...
```

---

## Project Structure

```
src/
├── config/          # Database config
├── controllers/     # Route handlers
├── helpers/         # Shopify, tier, export, response utilities
├── middleware/       # JWT auth, HMAC verification
├── migrations/      # Sequelize migrations
├── models/          # Sequelize models
├── routes/          # Express routers
└── server.js        # Entry point
```
