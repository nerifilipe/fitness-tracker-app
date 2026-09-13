# M2 — Identidade e sessões

## Entrega

- Registo, login, refresh rotativo, logout idempotente e acesso autenticado ao próprio perfil.
- Perfil: nome, timezone IANA, unidades de apresentação e objetivo semanal (1–14).
- Migração Alembic `0001_identity`: users/auth_sessions, FK/cascade, índices e constraints.
- Passwords Argon2id; refresh tokens aleatórios de 48 bytes, apenas SHA-256 no PostgreSQL.
- JWT access HS256 de 10 minutos, issuer/audience/tipo/expiração validados, ligado a uma
  sessão consultada na BD. Logout e reutilização de refresh revogam também o acesso imediato.
- Refresh rotativo com validade absoluta de 30 dias, sem prolongamento por rotação.
  Locks por utilizador serializam refresh/logout; reutilizar token consumido revoga a família.
- Erros estruturados e sem eco de passwords/tokens, respostas privadas no-store,
  validação de email/nome/password e rate limit de 30 requests/minuto/IP no módulo auth.
- Ecrãs de login/registo, Home personalizada e Perfil, navegação tipada e condicional.
  O botão Back não permite regressar a ecrãs privados depois de terminar sessão.
- SecureStore para refresh; access token apenas em memória. Refresh simultâneo é coalescido.
  Só há retry automático após 401; falhas de rede não repetem escritas automaticamente.
- OpenAPI exportado e tipos TypeScript gerados. Input/Screen e Button secundário reutilizáveis.

## Endpoints

| Método | Caminho | Resultado |
|---|---|---|
| POST | /api/v1/auth/register | 201, tokens + perfil; password de 12–128 caracteres |
| POST | /api/v1/auth/login | 200, tokens + perfil; erro genérico para credenciais inválidas |
| POST | /api/v1/auth/refresh | 200, novo par; token anterior consumido |
| POST | /api/v1/auth/logout | 204; revoga a família da sessão, mesmo com token antigo |
| GET | /api/v1/users/me | Perfil do utilizador do Bearer token |
| PUT | /api/v1/users/me | Substitui preferências; não aceita user_id/email/password |

JWT usa `sub`, `sid`, `type`, `iat`, `exp`, `iss`, `aud`. As rotas de login recebem JSON;
não são um servidor OAuth2 completo. OpenAPI utiliza HTTP Bearer no Swagger. Não há endpoint
genérico de leitura de outro utilizador: a propriedade deriva sempre do token autenticado.

## Validação executada

- Backend: 12 testes passaram em PostgreSQL, incluindo hash, email único, login, rotação,
  reutilização, concorrência, revogação, isolamento, expiração, assinatura/tipo/audience e 429.
- Testes executam a migração real num schema aleatório isolado; limpam apenas esse schema.
- Migração aplicada à BD local; `alembic check` sem diferenças pendentes.
- Mobile: 8 testes passaram para persistência, recuperação, 401 simultâneos, logout durante
  refresh, respostas tardias após troca de conta, falhas de armazenamento e perda de rede.
  TypeScript strict passou.
- Bundles Android/iOS exportados com sucesso; Expo dependency check passou.
- Validação visual e interação nativa (teclado, leitor de ecrã, SecureStore) ainda requerem
  dispositivo/Expo Go compatível. Não foi feito deploy.

## Ficheiros principais

`backend/app/modules/auth/{models,schemas,service,dependencies,router}.py`,
`backend/app/modules/users/{models,schemas,service,router}.py`, `backend/app/core/security.py`,
`backend/app/core/errors.py`, `backend/app/core/rate_limit.py`, `backend/migrations/`,
`backend/scripts/`, `backend/tests/test_auth.py`, `mobile/src/features/auth/`,
`mobile/src/navigation/RootNavigator.tsx`, `mobile/src/screens/{AuthScreen,ProfileScreen}.tsx`,
`mobile/src/services/api/{http.ts,schema.d.ts}`, `mobile/tests/session.test.ts` e lockfiles.

## Como testar manualmente

1. Seguir o README: PostgreSQL, instalar dependências, gerar segredo local, aplicar Alembic,
   iniciar Uvicorn e Expo com URL da API acessível ao dispositivo.
2. Criar conta com email e password ≥12 caracteres. Home mostra o nome; Perfil mostra email.
3. Alterar nome/objetivo/unidades e guardar. Confirmar que a Home reflete a alteração.
4. Fechar totalmente e reabrir; a app recupera a sessão por refresh sem pedir password.
5. Terminar sessão, usar Back e confirmar que a área privada não reaparece. Entrar novamente.
6. Experimentar credenciais inválidas, registo repetido, API desligada e reabertura offline.
   Em erro de rede a credencial guardada é preservada e aparece uma ação de nova tentativa.

## Limitações e decisões

Só Início/Perfil têm tabs agora; Workout entra quando existir uma funcionalidade real.
Login/registo não inclui recuperação de password nem verificação de email nesta milestone;
estas são necessárias antes de disponibilizar contas a utilizadores externos.

Logout exige rede para garantir revogação no servidor. Uma resposta perdida ao refresh pode
obrigar a novo login: o cliente não assume que um token consumido pode ser repetido em segurança.
Um problema de SecureStore não produz uma sessão falsamente persistida; a app tenta revogar
o token acabado de emitir e mostra o erro. Biometria não é exigida nesta versão.

Rate limit em memória é apropriado ao desenvolvimento com um worker; antes de produção,
usar limitação partilhada no gateway, HTTPS, política de recuperação/verificação de conta e
retenção/limpeza das sessões expiradas. Não colocar segredos em EXPO_PUBLIC_*.
Os testes ainda reportam os avisos transitivos Starlette/httpx e AnyIO identificados em M1.

`npm audit`: 17 ocorrências moderadas, nenhuma high/critical. As origens são `uuid`
na cadeia Expo/Xcode (GHSA-w5hq-g745-h8pq, já presente em M1) e `decode-uri-component`
na cadeia de navegação (GHSA-vcc3-ghjq-m6fr). A segunda não tem correção indicada pelo
audit; o seu risco descrito envolve inputs percent-encoded malformados. A app ainda não
configura deep links externos. Não foram aplicados overrides nem downgrade de Expo;
rever atualizações upstream antes de ativar links externos e publicar uma release.

O gerador OpenAPI requer TypeScript 5; corre isolado com versões fixadas através de npm exec.
O projeto Expo mantém TypeScript 6, sem overrides de peer dependencies.

## Docker local

O motor falhava nos sockets Windows `Docker/run/sailor-ingest.sock` e
`docker-secrets-engine/engine.sock`. Ambas as pastas temporárias foram renomeadas como
backups sob AppData/Local e recriadas pelo Docker; nenhum volume/container foi eliminado.
O PostgreSQL existente arrancou depois e recebeu a migração. Não foi usado factory reset.
Os backups têm sufixos `backup-fitness-m2` e `backup-fitness-m2-retry` e foram preservados.

## Próximo passo

M3: biblioteca de exercícios, seed repetível, pesquisa/filtros, favoritos e exercícios
custom com autorização por utilizador. Não iniciar templates ou tracking antes disso.

## Referências

- [FastAPI: JWT e hashing](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- [React Navigation: fluxo de autenticação](https://reactnavigation.org/docs/auth-flow/)
- [Alembic: migrations](https://alembic.sqlalchemy.org/en/latest/tutorial.html)
