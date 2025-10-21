```markdown
# Typebot – Local Installation Guide

This guide helps you run Typebot locally in a development environment.  
If you’re looking to self-host Typebot in production, follow the [Self-hosting guide](https://docs.typebot.io/self-host).

## Requirements

You need to have the following tools installed on your machine:

- [pnpm](https://pnpm.io/installation) (v8 or higher)
- [Node.js](https://nodejs.org/en/download/) (v18 or higher)
- [PostgreSQL](https://www.postgresql.org/download/) (v14 or higher)
- [Docker](https://www.docker.com/products/docker-desktop) + [Docker Compose](https://docs.docker.com/compose/install/)
- [Redis](https://redis.io/docs/getting-started/installation/)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)

> ✅ Recommended: use Linux or WSL on Windows for better compatibility.
```

---

## Clone the repository

```bash
git clone https://github.com/baptisteArno/typebot.git
cd typebot
```

---

## Install dependencies

```bash
nvm install 18 && nvm use 18
npm --global install pnpm@8
pnpm install
```

---

## Create a `.env` file

Duplicate the `.env.dev.example` file and name it `.env`:

```bash
cp .env.dev.example .env
```

---

## Start the app

Start the development server:

```bash
pnpm dev
```

This will start all the necessary packages (admin, builder, embed, etc.).

---

## Access the app

Once started, access the following:

- Builder UI: [http://localhost:3002](http://localhost:3002)
- Admin UI: [http://localhost:4000](http://localhost:4000)
- Embed UI: [http://localhost:5000](http://localhost:5000)

---

## Troubleshooting

## Useful scripts

```bash
supabase db push
```

### Correlation ID

Incoming requests can include an `X-Correlation-Id` header. When provided:

- The value is captured in the request context.
- Forwarded to internal `startChat` and `continueChat` handlers.
- Echoed back in the response headers (`X-Correlation-Id`).

Use this to trace a chat session across logs. If you omit the header, a correlation id is simply absent; the platform does not auto‑generate one yet.

- Stop Supabase:

```bash
supabase stop
```

- Clear node_modules:

```bash
pnpm install --force
```

- Build app

```bash
pnpm install --force && pnpm build:apps
```

---

## Contributing

See the [Contributing guide](https://docs.typebot.io/contribute) for how to submit changes or suggest improvements.
