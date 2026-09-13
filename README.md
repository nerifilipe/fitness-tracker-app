# Fitness Tracker

App mobile de fitness pessoal e para portefólio. React Native + Expo + TypeScript,
FastAPI + SQLAlchemy + PostgreSQL. Licença MIT.

**Estado: fundação M1.** Ecrã inicial dark, componentes de UI, verificação de ligação e
API health/readiness. Autenticação e registo de treino ainda não estão implementados.

- [Arquitetura, navegação, design system e milestones](docs/architecture.md)
- [Schema completo, relações, índices e cascades](docs/database.md)
- [Entrega e verificações de M1](docs/milestone-1.md)

## Executar localmente (PowerShell)

Requisitos: Node 22.13+ (preferir LTS), Python 3.12+, Docker Desktop com motor Linux ativo,
Expo Go compatível com SDK 57 ou development build. As credenciais Compose são apenas locais.

Na raiz:

```powershell
docker compose up -d db
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.lock
backend/.venv/Scripts/python -m pip install --no-deps -e backend
Copy-Item backend/.env.example backend/.env
cd backend
.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs. `/api/v1/health` confirma a API;
`/api/v1/ready` faz SELECT 1 e devolve 503 quando PostgreSQL não está disponível.
Ainda não há tabelas de negócio: a primeira migração Alembic será criada em M2.

Noutro terminal, na raiz:

```powershell
cd mobile
npm ci
Copy-Item .env.example .env
npm start
```

Antes de abrir no telemóvel, editar `mobile/.env`: `EXPO_PUBLIC_API_URL` deve ser
`http://<IPv4-do-PC>:8000/api/v1`; telemóvel e PC na mesma rede e firewall a permitir
porta 8000 na rede privada. Android emulator usa `10.0.2.2`; iOS simulator usa localhost.
Reiniciar Expo após alterar ambiente. Nunca colocar tokens/segredos em EXPO_PUBLIC_*.
O botão “Verificar ligação” verifica API **e BD**; a Home continua acessível sem rede.

## Verificar

```powershell
backend/.venv/Scripts/python -m pytest backend/tests -q
backend/.venv/Scripts/python -m ruff check backend
cd mobile
npm run typecheck
npx expo install --check
npx expo export --platform android --platform ios
```

Smoke manual: abrir Home, verificar legibilidade com fonte aumentada; carregar em
“Verificar ligação” com API/BD ligadas; desligar API e repetir; confirmar mensagem de
erro e possibilidade de nova tentativa. Exportar bundles não substitui testes em dispositivo.

Para parar PostgreSQL: `docker compose stop db` (preserva dados). Não usar `down -v`
se quiseres preservar o volume. Backend e Metro param com Ctrl+C.

## Dependências

Expo/React Native/TypeScript vêm do template oficial. Safe Area Context evita sobreposição
com notch/barras. Fetch nativo dispensa Axios. Backend usa FastAPI/Pydantic Settings,
SQLAlchemy/psycopg e Uvicorn; pytest/httpx/Ruff são ferramentas de desenvolvimento.
`mobile/package-lock.json` e `backend/requirements.lock` fixam resoluções. Para alterar
dependências Python, atualizar pyproject, instalar e regenerar lock com
`python -m pip freeze --exclude-editable`; não atualizar versões incidentalmente.
