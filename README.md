# HyperThread

HyperThread is a TypeScript/NestJS monorepo for a production-minded real-time chat platform. The project is designed around microservice boundaries, secure authentication, REST APIs, WebSocket messaging, PostgreSQL persistence, Redis-backed presence, and event-driven infrastructure with Kafka.

## Project Status

This repository currently contains the backend foundation for the platform:

- `auth-service` handles user registration, login, JWT access tokens, refresh tokens, sessions, and authenticated profile lookup.
- `chat-service` handles direct and group conversations, message persistence, cursor-based message reads, Socket.IO message delivery, idempotent sends, and Redis-backed socket presence.
- `docker-compose.yml` starts local PostgreSQL, Redis, Kafka, and Kafka UI services.
- `docs/` contains the product vision, requirements, domain model, and high-level/low-level design notes.

## Tech Stack

- Node.js 20+
- TypeScript
- NestJS
- pnpm workspaces
- PostgreSQL
- Prisma
- Redis
- Socket.IO
- Apache Kafka
- Docker Compose

## Repository Layout

```text
.
├── apps/
│   ├── auth-service/
│   │   ├── prisma/
│   │   ├── src/
│   │   └── test/
│   └── chat-service/
│       ├── prisma/
│       ├── src/
│       └── test/
├── docs/
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js 20 or newer
- pnpm
- Docker and Docker Compose

### Install dependencies

```bash
pnpm install
```

### Start local infrastructure

```bash
docker compose up -d
```

This starts:

- PostgreSQL on `localhost:5435`
- Redis on `localhost:6379`
- Kafka on `localhost:9092`
- Kafka UI on `http://localhost:8080`

### Environment variables

Each service expects its own `.env` file. Use the existing local environment files as your reference, or create files with these keys:

`apps/auth-service/.env`

```env
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5435/DATABASE
NODE_ENV=development
FRONTEND_URL=http://localhost:5000
JWT_ACCESS_SECRET=replace-with-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-at-least-32-characters
```

`apps/chat-service/.env`

```env
PORT=4001
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5435/DATABASE
NODE_ENV=development
JWT_ACCESS_SECRET=replace-with-the-same-access-secret-used-by-auth-service
REDIS_URL=redis://localhost:6379
```

### Run database migrations

Run migrations from each service directory so Prisma uses the correct schema and config.

```bash
cd apps/auth-service
pnpm exec prisma migrate dev

cd ../chat-service
pnpm exec prisma migrate dev
```

### Start services

In separate terminals:

```bash
pnpm --filter auth-service start:dev
```

```bash
pnpm --filter chat-service start:dev
```

Auth service Swagger documentation is available in development at:

```text
http://localhost:4000/api/docs
```

## Useful Commands

```bash
# Build a service
pnpm --filter auth-service build
pnpm --filter chat-service build

# Run tests
pnpm --filter auth-service test
pnpm --filter chat-service test

# Run e2e tests
pnpm --filter auth-service test:e2e
pnpm --filter chat-service test:e2e

# Lint
pnpm --filter auth-service lint
pnpm --filter chat-service lint
```

## API Overview

### Auth Service

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `GET /health`

### Chat Service

- `POST /conversations/direct`
- `POST /conversations/group`
- `POST /conversations/:conversationId/messages`
- `GET /conversations/:conversationId/messages?limit=50&before=<cursor>`

### WebSocket Events

The chat service exposes Socket.IO events for:

- `joinConversation`
- `sendMessage`
- `heartbeat`
- `newMessage`

Socket connections authenticate with a JWT access token passed in the Socket.IO handshake auth payload.

## Documentation

Project documentation lives in `docs/`:

- `00-project-vision.md`
- `01-product-requirement-document.md`
- `02-functional-requirements.md`
- `03-non-functional-requirements.md`
- `04-user-stories.md`
- `05-domain-model.md`
- `06-high-level-design.md`
- `07-low-level-design.md`

## Development Notes

- Services are intentionally split by ownership boundary.
- Each service owns its own Prisma schema and migrations.
- PostgreSQL stores durable auth, conversation, and message data.
- Redis is used for ephemeral real-time presence data.
- JWT secrets must be long, private, and consistent between services that validate the same access tokens.

## License

This project is currently marked as private and unlicensed in the service package manifests.
