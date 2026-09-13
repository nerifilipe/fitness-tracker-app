# Fitness Tracker

App mobile de fitness pessoal e para portefólio. React Native + Expo + TypeScript,
FastAPI + SQLAlchemy + PostgreSQL. Licença MIT.

**Estado: M3 — biblioteca de exercícios.** Registo/login/logout, perfil, catálogo de
exercícios, pesquisa/filtros, favoritos e criação/edição/arquivo de exercícios privados.
Navegação Home/Workout/Perfil. Templates e registo de treino chegam nas próximas milestones.

- [Arquitetura, navegação, design system e milestones](docs/architecture.md)
- [Schema completo, relações, índices e cascades](docs/database.md)
- [Entrega e verificações de M1](docs/milestone-1.md)
- [Entrega, contrato de autenticação e verificações de M2](docs/milestone-2.md)
- [Biblioteca, seed e verificações de M3](docs/milestone-3.md)

## Executar localmente (PowerShell)

Requisitos: Node 22.13+ (preferir LTS), Python 3.12+, Docker Desktop com motor Linux ativo,
Expo Go compatível com SDK 57 ou development build. As credenciais Compose são apenas locais.

Na raiz:

```powershell
docker compose up -d db
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.lock
backend/.venv/Scripts/python -m pip install --no-deps -e backend
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
backend/.venv/Scripts/python backend/scripts/setup_local.py
backend/.venv/Scripts/python -m alembic -c backend/alembic.ini upgrade head
backend/.venv/Scripts/python backend/scripts/seed_exercises.py
cd backend
.venv/Scripts/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs. `/api/v1/health` confirma a API;
`/api/v1/ready` faz SELECT 1 e devolve 503 quando PostgreSQL não está disponível.
Alembic cria identidade e biblioteca de exercícios. O seed acrescenta 24 exercícios e
10 grupos musculares; repetir o comando não duplica nem substitui dados existentes.
Não existe utilizador de demonstração nem password
predefinida: cria a tua conta no mobile. `JWT_SECRET` é obrigatório e o script gera-o apenas
se ainda não existir em `.env`; não substituir essa chave durante um reinício normal.

Noutro terminal, na raiz:

```powershell
cd mobile
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm start
```

Antes de abrir no telemóvel, editar `mobile/.env`: `EXPO_PUBLIC_API_URL` deve ser
`http://<IPv4-do-PC>:8000/api/v1`; telemóvel e PC na mesma rede e firewall a permitir
porta 8000 na rede privada. Android emulator usa `10.0.2.2`; iOS simulator usa localhost.
Reiniciar Expo após alterar ambiente. Nunca colocar tokens/segredos em EXPO_PUBLIC_*.
O endpoint `/api/v1/ready` verifica API **e BD**. Após fechar completamente a app, recuperar
a sessão requer rede; um erro de ligação mantém o refresh token guardado para tentar novamente.

## Verificar

```powershell
backend/.venv/Scripts/python -m pytest backend/tests -q
backend/.venv/Scripts/python -m ruff check backend
backend/.venv/Scripts/python -m alembic -c backend/alembic.ini check
cd mobile
npm run typecheck
npm test
npx expo install --check
npx expo export --platform android --platform ios
```

Os testes backend requerem PostgreSQL e criam/removem apenas um schema `test_auth_<uuid>`;
não apagam dados pessoais. `TEST_DATABASE_URL` permite escolher outra BD de testes.

Smoke manual: criar conta, alterar nome/objetivo no Perfil, confirmar Home atualizada,
fechar/reabrir app, terminar sessão e voltar a entrar. Verificar password incorreta,
email repetido, fonte aumentada, teclado e perda de rede. Logout requer rede para revogar
a sessão no servidor; em caso de falha, a app mantém a sessão e permite tentar novamente.
Exportar bundles não substitui testes em dispositivo.

Na área **Workout**, pesquisa “dumbbell”, filtra por músculo/equipamento e abre um exercício
para o guardar nos favoritos. Cria um exercício personalizado, edita-o e arquiva-o.
Confirma que desaparece da biblioteca e que não é visível noutra conta. A Home também
permite abrir esta área pelo botão “Explorar exercícios”.

## Atualizar o contrato da API

```powershell
backend/.venv/Scripts/python backend/scripts/export_openapi.py
cd mobile
npm run api:types
npm run typecheck
```

Commitar `docs/openapi.json` e `mobile/src/services/api/schema.d.ts` juntos. O gerador
OpenAPI 7.13 usa TypeScript 5.9 num ambiente npm exec isolado; a app mantém TypeScript 6
exigido pelo Expo. Não é preciso ter a API nem a BD a correr para gerar o contrato.

Para parar PostgreSQL: `docker compose stop db` (preserva dados). Não usar `down -v`
se quiseres preservar o volume. Backend e Metro param com Ctrl+C.

## Dependências

Expo/React Native/TypeScript vêm do template oficial. Safe Area Context evita sobreposição
com notch/barras. Fetch nativo dispensa Axios. Backend usa FastAPI/Pydantic Settings,
SQLAlchemy/psycopg e Uvicorn; M2 acrescenta Alembic, PyJWT, pwdlib/Argon2 e email-validator.
React Navigation/screens gere a navegação, SecureStore guarda apenas refresh tokens e
Ionicons fornece a família de ícones. pytest/httpx/Ruff, Vitest e Prettier são ferramentas
de desenvolvimento. Não são necessários Redis, Axios ou uma biblioteca de estado global.
`mobile/package-lock.json` e `backend/requirements.lock` fixam resoluções. Para alterar
dependências Python, atualizar pyproject, instalar e regenerar lock com
`python -m pip freeze --exclude-editable`; não atualizar versões incidentalmente.
