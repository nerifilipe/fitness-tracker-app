# Fitness Tracker

App mobile de fitness pessoal e para portefólio. React Native + Expo + TypeScript,
FastAPI + SQLAlchemy + PostgreSQL. Licença MIT.

**Estado: M12 — API online e APK instalado no Android.**
Instalação e funcionamento confirmados pelo utilizador após a entrega. API alojada
no Render Free, PostgreSQL no Neon Free e APK compilado e assinado pelo Expo EAS.

## Experimentar no Android

1. [Descarregar o APK 0.1.0 (2)](https://expo.dev/artifacts/eas/mPO6dddmeKd-IrB6CpaMe0ebkzlz3hpnfxSqXFXz7OM.apk)
   no telemóvel e abrir o ficheiro em Downloads para instalar.
2. Criar uma conta na app. A base online é independente da base de desenvolvimento;
   contas e dados locais não são transferidos automaticamente.
3. Criar um plano, iniciar um treino ou pesquisar um alimento em Nutrição.

Funciona sem Expo Go e sem o PC. É necessária ligação à Internet para autenticar,
carregar dados e sincronizar; o treino já iniciado permite registar séries offline.
O primeiro pedido após inatividade pode demorar enquanto o serviço gratuito acorda.
O APK espera até 90 segundos por pedido.

[Página do build no Expo](https://expo.dev/accounts/nerifilipe/projects/fitness-tracker/builds/07348244-3818-4517-89be-3985a2fa6a7b)
· [API online](https://fitness-tracker-api-ku46.onrender.com/api/v1/health)
· [Publicação e atualização](docs/milestone-12.md)

## Funcionalidades

- **Treinos:** biblioteca com 24 exercícios iniciais, favoritos, exercícios próprios,
  planos editáveis, séries, cargas, repetições, RIR e cronómetro de descanso.
- **Recuperação:** treino ativo guardado em SQLite, pausa/retoma, recuperação após
  fechar a app e sincronização das alterações feitas offline.
- **Histórico:** resumos de sessões, volume, recordes e dashboard semanal.
- **Nutrição:** pesquisa no Open Food Facts com calorias e macros preenchidos,
  recentes, favoritos, porções rápidas e repetição de refeições de outro dia.
- **Progresso:** peso e medidas corporais, gráficos e evolução da força por exercício.
- **Progressão:** sugestões com base no último treino e preenchimento das séries
  por realizar, com opção de desfazer.

## Validação e limites atuais

A API online passou as verificações de saúde, ligação à base de dados e bloqueio
sem autenticação. O APK foi compilado e inspecionado; o utilizador confirmou que
conseguiu instalá-lo e utilizá-lo. Esta confirmação não representa uma execução
documentada de todos os cenários de teste.

O fluxo principal de treino teve validação Android em M7. Nutrição, medidas,
evolução da força e sugestões têm testes automatizados; a revisão detalhada de
todos esses ecrãs e dos cenários offline do APK continua por registar. A entrega
atual é um APK de distribuição interna; não há publicação nas lojas nem validação
em dispositivo iOS. As quotas dos serviços gratuitos continuam a aplicar-se.

## Documentação

- [Arquitetura, navegação, design system e milestones](docs/architecture.md)
- [Modelo de dados, relações, índices e cascades](docs/database.md)
- [Entrega e verificações de M1](docs/milestone-1.md)
- [Entrega, contrato de autenticação e verificações de M2](docs/milestone-2.md)
- [Biblioteca, seed e verificações de M3](docs/milestone-3.md)
- [Planos de treino, regras de edição e verificações de M4](docs/milestone-4.md)
- [Treino ativo, recuperação e verificações de M5](docs/milestone-5.md)
- [Conclusão, histórico, resultados e verificações de M6](docs/milestone-6.md)
- [Validação automatizada, correções e pendências de M7](docs/milestone-7.md)
- [Nutrição, pesquisa de alimentos e verificações de M8](docs/milestone-8.md)
- [Peso, medidas, gráficos e verificações de M9](docs/milestone-9.md)
- [Evolução da força, recordes e comparação de sessões em M10](docs/milestone-10.md)
- [Sugestões de progressão e preenchimento das séries em M11](docs/milestone-11.md)
- [API publicada, APK instalado e manutenção de M12](docs/milestone-12.md)

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
Alembic cria identidade, biblioteca, planos, treinos, nutrição e medidas corporais. O seed acrescenta 24 exercícios e
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
O endpoint `/api/v1/ready` verifica API **e BD**. Depois de uma autenticação bem-sucedida
em M5, a app pode recuperar a identidade em cache e o treino SQLite sem rede.
O primeiro login e a criação do snapshot inicial requerem rede. Instalações antigas
precisam de uma recuperação online para atualizar o formato das credenciais.
A cache não dá acesso à API: o servidor continua a exigir um token válido.

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
O teste de integração mobile também requer Node no PATH e `npm ci` executado em mobile.
Inicia e encerra a sua própria API local numa porta livre, sem usar contas ou treinos
pessoais. Para executar só esse fluxo:

```powershell
backend/.venv/Scripts/python -m pytest backend/tests/test_mobile_integration.py -q
```

O `npm test` normal salta o cenário de integração, porque precisa da API isolada que
este comando Python prepara. O cenário é executado pela suite backend completa.

Smoke manual: criar conta, alterar nome/objetivo no Perfil, confirmar Home atualizada,
fechar/reabrir app, terminar sessão e voltar a entrar. Verificar password incorreta,
email repetido, fonte aumentada, teclado e perda de rede. Logout requer rede para revogar
a sessão no servidor; em caso de falha, a app mantém a sessão e permite tentar novamente.
Exportar bundles não substitui testes em dispositivo.

Na área **Workout → Biblioteca de exercícios**, pesquisa “dumbbell”, filtra por músculo/equipamento e abre um exercício
para o guardar nos favoritos. Cria um exercício personalizado, edita-o e arquiva-o.
Confirma que desaparece da biblioteca e que não é visível noutra conta. A Home também
permite abrir Workout pelo botão “Abrir área de treino”.

Em **Workout → Criar plano**, dá-lhe um nome, adiciona exercícios e configura séries,
repetições, carga (kg), descanso e RIR opcional. Usa Subir/Descer para ordenar; guarda,
reabre e confirma os valores. Duplica e edita a cópia para verificar que o original
fica intacto. Apagar remove o plano da lista por arquivo, preservando as referências.
Ao voltar atrás com alterações por guardar, a app pede confirmação. Os planos requerem
rede; os rascunhos do editor ficam apenas em memória até guardar.

Num plano com exercícios, toca em **Iniciar treino**. Confirma os valores de cada série,
conclui-a e verifica o descanso automático. Experimenta pausa/retoma, adicionar/substituir
exercícios e fechar completamente o Expo Go. Ao reabrir, usa **Retomar treino** na Home
ou em Workout. Desliga a rede, regista uma série, fecha/reabre e confirma a recuperação;
depois liga a rede e toca em **Sincronizar agora**. Cancelar preserva o registo como cancelado.
O cronómetro de descanso não envia notificações quando a app está fechada.

Depois de registar pelo menos uma série, toca em **Finalizar treino**. A conclusão
também fica guardada sem rede; sincroniza para abrir **Ver resumo**. Séries não realizadas
ficam identificadas no detalhe e excluídas dos resultados. Abre **Ver histórico** na Home
ou **Histórico de treinos** em Workout. A Home mostra a semana de segunda a domingo no
fuso do Perfil, objetivo semanal e sessões recentes. Os resumos e o histórico requerem
rede; erros de carregamento não são apresentados como resultados vazios.

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
Ionicons fornece a família de ícones. M5 usa expo-sqlite para o rascunho persistido e
expo-crypto para UUIDs; @types/node tipa o teste com SQLite real no Node.
pytest/httpx/Ruff, Vitest e Prettier são ferramentas
de desenvolvimento. Não são necessários Redis, Axios ou uma biblioteca de estado global.
`mobile/package-lock.json` e `backend/requirements.lock` fixam resoluções. Para alterar
dependências Python, atualizar pyproject, instalar e regenerar lock com
`python -m pip freeze --exclude-editable`; não atualizar versões incidentalmente.
