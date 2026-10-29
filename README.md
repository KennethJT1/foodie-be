# KJT Foodie API

Express backend for the KJT Foodie marketplace (customers, vendors, riders, admins).
Node 20+, ESM, MySQL 8 (Sequelize), Redis 7 (from phase 5). No Docker.

Google playground: [developers.google.com/oauthplayground/?iss=https%3A%2F%2Faccounts.google.com&amp;code=4%2F0AXlqoi4moQr656HoF2h-F7d2qH_UQIrm9gszrxHburP10mAh6G-G_mluju6czC85R9RcRA&amp;scope=email+profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+openid&amp;authuser=0&amp;prompt=consent](https://developers.google.com/oauthplayground/?iss=https%3A%2F%2Faccounts.google.com&code=4%2F0AXlqoi4moQr656HoF2h-F7d2qH_UQIrm9gszrxHburP10mAh6G-G_mluju6czC85R9RcRA&scope=email+profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+openid&authuser=0&prompt=consent)

## Run it locally

### 1. Install MySQL 8 and Redis 7 (Ubuntu)

```bash
sudo apt install mysql-server redis-server
sudo systemctl enable --now mysql redis-server
```

macOS: `brew install mysql redis && brew services start mysql && brew services start redis`.

Create the databases and a user (`sudo mysql`):

```sql
CREATE DATABASE kjt_foodie CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE kjt_foodie_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'kjt_foodie'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON kjt_foodie.* TO 'kjt_foodie'@'localhost';
GRANT ALL PRIVILEGES ON kjt_foodie_test.* TO 'kjt_foodie'@'localhost';
```

A managed MySQL (e.g. TiDB Cloud) also works: set its host, port and user in `.env` and `DB_SSL=true`.
Tests are much faster against a local MySQL: keep `DB_*` on the managed server and set `DB_TEST_HOST`, `DB_TEST_USER`, `DB_TEST_PASS` and `DB_TEST_SSL=false` for the local one.

### 2. Configure and start

```bash
npm install
cp .env.example .env      # fill in DB_* and Cloudinary keys; later phases add more
npm run db:migrate
npm run seed              # wipes every table and loads the demo world (never in production)
npm run dev               # http://localhost:4000
npm run dev:worker        # in a second terminal: background jobs
```

- API: `http://localhost:4000/api/v1` (health: `GET /api/v1/health`)
- Swagger UI: `http://localhost:4000/docs` (serves `docs/api/openapi.yaml`)
- Load balancer checks: `GET /health`, `GET /health/ready`
- Bull Board (super admin): `http://localhost:4000/admin/queues?token=<access token>` (the token moves into a cookie)

Point the frontend at it with `VITE_USE_MOCKS=false` and `VITE_API_URL=http://localhost:4000/api/v1`.

## Scripts

| Script                                               | What it does                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run dev` / `npm start`                          | API with / without auto-reload                                                                       |
| `npm run worker` / `npm run dev:worker`              | Background job worker (SMS, email, in-app notifications). Run it next to the API                     |
| `npm run scheduler`                                  | Registers repeatable jobs, then exits (run on every deploy)                                          |
| `npm test`                                           | Jest + Supertest. Creates and migrates the test database (`DB_NAME_TEST`, must end in `_test`) first |
| `npm run test:coverage`                              | Tests with a coverage report                                                                         |
| `npm run lint` / `npm run lint:fix`                  | ESLint                                                                                               |
| `npm run format` / `npm run format:check`            | Prettier                                                                                             |
| `npm run db:migrate` / `npm run db:migrate:undo:all` | Sequelize migrations                                                                                 |
| `npm run seed`                                       | Wipe and seed the deterministic demo data                                                            |

## Docs

| Doc                                                                                                                                          | What it is                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`docs/BACKEND-PROGRESS.md`](docs/BACKEND-PROGRESS.md)                                                                                       | What is done and what is next. **Start here**                       |
| [`docs/KJT Foodie — Backend Build Plan.md`](docs/KJT%20Foodie%20—%20Backend%20Build%20Plan.md)                                               | Phases, scope and done criteria                                     |
| [`docs/api/openapi.yaml`](docs/api/openapi.yaml)                                                                                             | The API contract (wins over everything else)                        |
| [`docs/05-backend-handoff.md`](docs/05-backend-handoff.md)                                                                                   | Conventions, filters, events, rules and seed data from the frontend |
| [`docs/KJT Foodie — Backend Architecture.md`](docs/KJT%20Foodie%20—%20Backend%20Architecture.md)                                             | Folder layout, middleware, queues                                   |
| [`docs/KJT Foodie — Database Schema.md`](docs/KJT%20Foodie%20—%20Database%20Schema.md)                                                       | Tables and columns                                                  |
| [`docs/Food Marketplace App — Business Requirements Document.md`](docs/Food%20Marketplace%20App%20—%20Business%20Requirements%20Document.md) | Business rules (BR-\*, FR-\*)                                       |
| [`docs/postman/`](docs/postman/)                                                                                                             | Postman collection                                                  |
