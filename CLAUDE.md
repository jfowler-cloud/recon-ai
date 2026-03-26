# Recon AI — AI Assistant Context

## Project Overview

OSINT intelligence portal serving three personas: OSINT analysts (data ingestion, vulnerability dashboards, investigations), red team operators (prioritized targets, tool tracking, operations), and leadership (cross-domain visibility, goal-setting, AI-powered Q&A). Data flows through smart parsing pipelines into vectorized storage for AI-powered search and analysis.

## Mono-Repo Layout

```
recon-ai/
├── apps/
│   ├── agents/                     # Strands agents (Python 3.13+, uv)
│   │   ├── osint_chat_agent/       # OSINT analyst chat — search, vulnerability summary, threat landscape
│   │   ├── redteam_chat_agent/     # Red team chat — targets, tool history, leadership goals
│   │   ├── leadership_chat_agent/  # Leadership chat — cross-domain search, operations overview
│   │   ├── target_enrichment/      # Plain English → structured target (idea-fairy pattern)
│   │   ├── prioritization/         # Score + rank targets against leadership goals
│   │   ├── shared/                 # Pydantic config, DynamoDB helpers, embeddings (Titan v2)
│   │   ├── tests/
│   │   └── pyproject.toml
│   ├── functions/                  # Lambda handlers (Python 3.13+, uv)
│   │   ├── upload_data/            # [Phase 1] Generate presigned S3 URL + RA-Uploads record
│   │   ├── parse_upload/           # [Phase 1] Route by sourceType, extract/embed via adapter pattern
│   │   ├── get_config/             # [Phase 1] Read runtime config
│   │   ├── update_config/          # [Phase 1] Write runtime config
│   │   ├── seed_data/              # [Phase 1] CDK custom resource: seed sources + config
│   │   ├── trigger_ingestion/      # [Phase 1] Start vectorization workflow
│   │   ├── create_ticket/          # [Phase 2] Create RA-Tickets + initial RA-TicketNotes entry
│   │   ├── update_ticket/          # [Phase 2] Status transitions (state machine), notes append
│   │   ├── list_tickets/           # [Phase 2] Query tickets by GSI (owner/status/type/target)
│   │   ├── create_target/          # [Phase 3] Accept plain-text goal, create stub, start enrichment
│   │   ├── update_target/          # [Phase 3] Status changes, manual edits
│   │   ├── queue_for_redteam/      # [Phase 2] OSINT finding → red team target
│   │   ├── update_context/         # [Phase 3] Save leadership goals, trigger re-prioritization
│   │   ├── manage_tools/           # [Phase 3] CRUD for RA-Tools + vectorize risk/success profiles
│   │   ├── record_tool_action/     # [Phase 3] Write RA-ToolActions entry
│   │   ├── chat_handler/           # [Phase 4] Invoke persona-specific Strands agent (fire-and-poll)
│   │   ├── get_session/            # [Phase 4] Retrieve chat session + messages
│   │   ├── list_sessions/          # [Phase 4] List user's past sessions
│   │   ├── get_dashboard/          # [Phase 2] Aggregated dashboard data per persona
│   │   ├── tests/
│   │   └── pyproject.toml
│   ├── infra/                      # CDK v2 TypeScript
│   │   ├── bin/recon-ai.ts         # App bootstrap, reads config.json
│   │   ├── lib/
│   │   │   ├── auth-stack.ts       # Cognito User Pool + Identity Pool + 4 groups (incl. admin)
│   │   │   ├── database-stack.ts   # 13 DynamoDB tables, S3 buckets, CloudFront
│   │   │   ├── functions-stack.ts  # Lambda layers, functions, IAM, alarms
│   │   │   └── workflow-stack.ts   # Step Functions, EventBridge, Cognito roles
│   │   ├── test/
│   │   └── package.json
│   └── web/                        # React 19 + Vite + Cloudscape
│       ├── src/
│       │   ├── App.tsx             # Amplify auth, AppLayout, role-based nav
│       │   ├── components/         # 17 views: OSINT (5), Red Team (6), Leadership (6)
│       │   ├── hooks/              # useChatPolling, useTicketPolling
│       │   ├── utils/              # api.ts, formatters.ts, charts.ts
│       │   └── config/amplify.ts   # Cognito + AWS resource config
│       ├── e2e/
│       ├── vitest.config.ts
│       └── package.json
├── scripts/
│   └── setup-env.sh               # Populate .env from CloudFormation outputs
├── config.json                     # App config + test commands
├── CLAUDE.md                       # This file
└── README.md
```

## Tech Stack

- **Frontend**: React 19, Vite 7, TypeScript 5.7, AWS Cloudscape, Amplify Authenticator, Recharts, React Flow, Mermaid.js, 18 views
- **Backend**: Python 3.13+, uv, AWS Lambda (Graviton / ARM_64), Step Functions, aws-lambda-powertools
- **Agents**: Strands SDK (5 agents: 3 chat + enrichment + prioritization)
- **AI**: Claude via Amazon Bedrock (tiered: Haiku 4.5 / Sonnet 4.5 / Opus 4.5), Titan Embeddings v2
- **Database**: DynamoDB (13 tables, RA- prefix), S3 (uploads, vectors, hosting)
- **Auth**: Cognito User Pool + Identity Pool (4 groups: osint-analyst, red-team-analyst, leadership, admin)
- **Infra**: CDK v2 TypeScript (4 stacks: RA-Auth, RA-Database [13 tables], RA-Functions [24 Lambdas], RA-Workflow)
- **Hosting**: S3 + CloudFront
- **Testing**: Vitest + Playwright (frontend), pytest + moto (backend), Jest (CDK)
- **Linting**: ruff (Python, line-length=120, target py313), TypeScript strict mode

## Key Architecture Decisions

- Frontend calls DynamoDB + Lambda directly via Cognito identity pool credentials (no API Gateway)
- Single `parse_upload` Lambda with adapter pattern — new source types require only a new adapter function + config entry
- Unified RA-Tickets table for both OSINT investigations and red team operations (`ticketType` GSI separates views)
- Three separate chat agents (not one multi-persona agent) — focused tool surfaces and prompts
- S3 vectors with in-memory cosine similarity (not OpenSearch) — works for <10K doc corpus
- Comprehend for entity extraction (budget-conscious), LLMs for semantic enrichment/chat only
- Manual tool tracking with future automation hooks (executionType, apiEndpoint fields in RA-ToolActions)
- Target prioritization uses weighted formula: alignment*0.40 + severity*0.30 + (100-effort)*0.20 + urgency*0.10
- Ticket state machine: new → triaging → investigating → active → completed → closed
- Shared ChatPanel component with session history sidebar (rename/delete/resume)
- Shared agent handler factory (`make_chat_handler`) eliminates duplicate Lambda code
- CSS custom properties (`:root` vars) for all colors with dark/light variants
- S3 vector caching: in-memory (5-min TTL) + /tmp disk cache
- S3 bucket versioning enabled (uploads 30d noncurrent, vectors 7d)
- CloudFront security headers: HSTS, X-Content-Type-Options, X-Frame-Options, XSS-Protection
- Lambda DLQ (SQS RA-LambdaFailures) + Step Functions error handlers with catch states
- Configurable table prefix (default 'RA') for multi-environment deploys

## DynamoDB Tables

| Table | PK | SK | Key GSIs | TTL |
|-------|----|----|----------|-----|
| RA-DataSources | sourceId | — | — | — |
| RA-Uploads | uploadId | — | AnalystIndex, StatusIndex | — |
| RA-Documents | uploadId | documentId | — | 365d |
| RA-Tickets | ticketId | — | OwnerIndex, StatusIndex, TypeIndex, TargetIndex | — |
| RA-TicketNotes | ticketId | noteId | — | — |
| RA-Targets | targetId | — | StatusIndex(status, priorityScore) | — |
| RA-LeadershipContext | contextId | — | — | — |
| RA-ToolActions | ticketId | actionId | — | — |
| RA-Tools | toolId | — | CategoryIndex(category, createdAt), StatusIndex(status, name) | — |
| RA-ChatSessions | userId | sessionId | — | 90d |
| RA-ChatMessages | sessionId | messageId | — | 90d |
| RA-Config | configKey | — | — | — |
| RA-ScoringHistory | runId | — | — | 90d |

## Cognito Groups & Permissions

- **osint-analyst** — upload data, create/update tickets, queue for red team, chat, dashboard
- **red-team-analyst** — create/update targets, manage tools, record tool actions, create/update tickets, chat, dashboard
- **leadership** — update context (goals/KPIs), chat (cross-domain), target overview, tool registry, dashboard, config
- **admin** — all permissions + seed demo data, admin banner

## Deployment Tiers

| Tier | Chat Agent | Enrichment | Prioritization | Est. Cost |
|------|-----------|------------|----------------|-----------|
| `testing` | Haiku 4.5 | Haiku 4.5 | Haiku 4.5 | ~$2/mo |
| `optimized` | Sonnet 4.5 | Haiku 4.5 | Sonnet 4.5 | ~$5/mo |
| `premium` | Opus 4.5 | Sonnet 4.5 | Opus 4.5 | ~$12/mo |

## Running Tests

```bash
# Agents (79 tests, 83% coverage)
cd apps/agents && uv sync --all-extras && uv run pytest tests/ -v

# Functions (209 tests, 98% coverage)
cd apps/functions && uv sync --all-extras && uv run pytest tests/ -v

# Frontend unit (50 tests, 44% line coverage)
cd apps/web && npm test

# Frontend coverage report
cd apps/web && npm run test:coverage

# E2E screenshots (17 tests across 3 personas)
cd apps/web && npm run test:e2e

# CDK (83 tests)
cd apps/infra && npm test

# CDK synth
cd apps/infra && npx cdk synth
```

### Test Coverage Summary

- **Backend 98%** — near-complete; uncovered lines are `ConditionalCheckFailedException` catch blocks (moto limitation)
- **Agents 83%** — 5 pre-existing failures from moto GSI scan differences vs real DynamoDB
- **CDK 83 tests** — assertion-based validation of all 4 stacks (resources, properties, outputs)
- **Frontend 44% lines** — all 17 components render-tested with mocked Cloudscape + API stubs; uncovered 56% is modal interactions, split panel selection events, React Flow canvas (jsdom limitation), Recharts event handlers, and error/retry paths that require integration-level testing or richer component mocks
- **E2E 17 screenshots** — Playwright captures all views across osint-analyst, red-team-analyst, and leadership personas

## CDK Deploy

```bash
cd apps/infra && npm install
AWS_PROFILE=cdk-deploy-prod npx cdk deploy --all --require-approval never
```

## UI Theme

Dark mode default (localStorage persisted, toggle in TopNav). Standard Cloudscape dark theme — no custom accent color. To add a custom accent (e.g. red #e8001c), uncomment the relevant sections in `apps/web/src/index.css`.

## CI / Test Commands

Test commands configured in `config.json`.
