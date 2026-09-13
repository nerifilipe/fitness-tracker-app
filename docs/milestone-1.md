# M1 — Fundação

## Criado

- Auditoria do repositório e arquitetura da aplicação completa, com schema e diagrama ER.
- Mobile Expo SDK 57, React Native e TypeScript strict, tema dark e Home sem dados fictícios.
- Text, Card e Button reutilizáveis, safe areas e feedback loading/erro/sucesso.
- Cliente fetch com timeout, validação de resposta e cancelamento no unmount.
- FastAPI app factory, settings, SQLAlchemy Base/sessão/engine e health/readiness.
- Compose PostgreSQL com volume persistente, healthcheck e binding apenas localhost.
- Testes de health/readiness/CORS e lockfiles. Não foram criadas tabelas de versões futuras.

## Ficheiros principais

`mobile/App.tsx`, `mobile/src/screens/HomeScreen.tsx`, `mobile/src/theme/index.ts`,
`mobile/src/components/ui/*`, `mobile/src/services/api/client.ts`,
`backend/app/main.py`, `backend/app/core/config.py`, `backend/app/db/session.py`,
`backend/app/modules/health/router.py`, `backend/tests/test_health.py`, `compose.yaml`,
`docs/architecture.md`, `docs/database.md` e `README.md`.

## Como testar

Seguir os comandos no README. Verificar Home e ligação em dispositivo, incluindo API
indisponível, texto aumentado e tentativa repetida. Os testes readiness com mocks validam
o contrato e ocultação de erros; não comprovam disponibilidade de um PostgreSQL real.

## Limites e próximo passo

O Docker Desktop foi iniciado e PostgreSQL permanece ativo no container deste projeto.
Autenticação, navegação entre áreas e migrações de
entidades começam em M2. Branding final/ícones de loja e validação visual nativa continuam
pendentes; os assets atuais são os do template. Não foi efetuado deploy.

Próximo passo: M2 identidade (users, auth_sessions, Alembic, JWT access/refresh rotativo,
SecureStore, screens de login/registo e autorização por utilizador).

## Resultados de validação

- pytest: 4 testes passaram.
- Ruff: passou.
- TypeScript strict (`npm run typecheck`): passou.
- Expo compatibility check: dependências atualizadas e compatíveis.
- Export Metro/Hermes: bundles Android e iOS gerados com sucesso.
- Readiness com SQLAlchemy/psycopg e PostgreSQL real: HTTP 200, `{"status":"ok"}`.
- `git diff --check`: sem erros de whitespace.
- Sem teste visual/interação em dispositivo físico ou emulador nesta milestone.

`npm audit` reportou 10 ocorrências moderadas na cadeia Expo → xcode → uuid,
associadas a GHSA-w5hq-g745-h8pq. Sem ocorrências high/critical. A sugestão automática
implica downgrade para Expo 46; não foi aplicada. Rever atualização upstream antes de release.
pytest também emite avisos de depreciação transitivos de Starlette/httpx e AnyIO;
não afetam os resultados, mas devem ser acompanhados nas atualizações do tooling.
