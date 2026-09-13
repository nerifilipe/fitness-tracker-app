# Arquitetura e plano de produto

## Auditoria inicial

Em 13/09/2026, o repositório continha apenas README.md, .gitignore e LICENSE (MIT).
Não existiam aplicações, dependências, testes, dados, AGENTS.md ou código a migrar.
A licença é preservada e o ignore é complementado para Python/Expo.

## Estrutura final proposta

```text
mobile/
  App.tsx
  src/
    navigation/             # stack de autenticação, tabs e treino fullscreen
    screens/                # home, workout, history, profile; progress/nutrition depois
    components/ui/          # primitivas do design system
    features/               # auth, exercises, workouts; outros quando necessários
    hooks/
    services/api/           # HTTP e tipos gerados do OpenAPI
    theme/
    types/
    utilities/
backend/
  app/
    main.py
    core/                   # settings, segurança e erros
    db/                     # engine, sessões e Base SQLAlchemy
    modules/
      health/
      auth/                 # cada módulo: router, schemas, service, models
      users/
      exercises/
      workouts/
      progress/             # V2
      nutrition/            # V3
      analytics/            # V2+, consultas derivadas
  migrations/               # Alembic a partir da primeira entidade
  tests/
docs/
compose.yaml
```

Esta árvore é o destino, não uma lista de pastas vazias a criar já. Monólito modular:
React Native → REST → routers Pydantic → services → SQLAlchemy → PostgreSQL.
Routes validam e autorizam, services coordenam regras e transações. Sem microserviços,
repository genérico, Redis ou filas enquanto não houver necessidade concreta.
SQLAlchemy síncrono com psycopg e endpoints `def` para operações de base de dados.

## Comunicação

API versionada em `/api/v1`, JSON, OpenAPI em `/openapi.json`. UUIDs como strings,
datas ISO 8601 UTC e campos snake_case. Quantidades decimais com contrato explícito;
converter texto de input apenas após validação. Paginação por cursor nas listas históricas.
Erros de domínio terão `{error: {code, message, details}, request_id}`; validação FastAPI
422 documentada separadamente. O cliente distingue indisponibilidade, timeout, 401 e 422.

JWT access de curta duração em memória; refresh opaco, rotativo, com hash no servidor
e armazenamento nativo SecureStore. Logout revoga a sessão; rotação deteta reutilização.
Password com Argon2, autorização por proprietário em todos os recursos e rate limiting
no login antes de exposição pública. HTTPS em produção. Nenhum segredo em EXPO_PUBLIC_*.
Implementar este contrato em M2; M1 só expõe health/readiness sem dados pessoais.

Estado M2: identidade implementada (ver milestone-2.md). Erros de validação agora usam
o mesmo envelope de erro, omitindo inputs para não devolver passwords/tokens em respostas.
Detalhes de campos não são incluídos nesta versão. Perfil usa PUT completo de preferências.

O cliente usa fetch inicialmente. Tipos OpenAPI gerados em M2 para impedir divergência.
Requests de escrita nunca são repetidos cegamente: UUID criado no dispositivo e chaves
de idempotência para criação/finalização de treino. Atualização com `version` e 409 em
conflito. O servidor calcula volume/PRs e finaliza em transação.

Treino ativo terá rascunho persistido em SQLite por utilizador a cada alteração (M5),
independente da navegação e com recuperação após reinício. Fila limitada ao treino ativo,
sem implementar sincronização geral. Flush/retry explícito ao recuperar rede. Mostrar
estado pendente; só confirmar sincronização após resposta do servidor. Cronómetro baseado
em timestamps, não em número de ticks; pausa acumula duração e descanso guarda deadline.

## Navegação e experiência

V1: tabs Home, Workout, Profile. Histórico acessível por Workout e Home; biblioteca e
editor de template num stack. Treino ativo em stack fullscreen, com acesso rápido à sessão
em curso. Evitar tabs de funcionalidades indisponíveis. V2 acrescenta Progress; V3 Nutrition,
resultando em Home / Workout / Progress / Nutrition / Profile.

Autenticação num stack separado. No treino: tabela editável, teclado numérico, último
resultado por exercício, conclusão de set com um toque, descanso automático ajustável,
ações secundárias em menu e confirmação para cancelar. Back não elimina rascunho.
Home mostra apenas dados reais e estados vazios úteis; sem métricas fictícias.

Escolha inicial para M2: React Navigation (native stack + bottom tabs), com parâmetros
tipados e sem necessidade de rotas por ficheiro. M1 ainda não precisa de um navigator.

## Design system inicial

Dark principal: fundo #0B0F14, superfície #151C25, borda #2C3949; texto #F4F7FA,
secundário #A8B5C4, ação lima #C7F36B com texto #142006; erro #FF9A9A.
Spacing 4/8/12/16/24/32/48; raios 12/20; fonte nativa para evitar downloads.
Tipografia 12 (label), 16 (body), 20 (section), 32 (title); números tabulares.
Touch targets ≥48, labels acessíveis, suporte a font scaling, safe areas e teclado.
Button, Card, Input, Modal, Icon, loading/empty/error partilham tokens. Criar apenas
primitivas usadas na milestone. Ícones de uma única família ao introduzir navegação.
Animações curtas 150–220ms respeitam reduced motion; nunca atrasam registo de sets.

## Milestones V1 e critérios de conclusão

1. **Fundação**: Expo TypeScript, tema/primitivas usadas, Home vazia, cliente health,
   FastAPI, settings, sessão SQLAlchemy, PostgreSQL Compose, testes health e guia local.
   Sem tabelas de negócio nem autenticação simulada.
2. **Identidade**: users/auth_sessions, Alembic, registo/login/refresh/logout, SecureStore,
   isolamento entre utilizadores e testes de rotação/revogação; Profile mínimo.
3. **Biblioteca**: seed repetível de exercícios, pesquisa/filtros, favoritos e custom,
   autorização e paginação; sem dependência de catálogo externo.
4. **Templates**: CRUD, ordem, duplicação, exercícios e sets planeados; edição mobile.
5. **Treino ativo**: snapshot de template, sets/peso/reps/RIR/tipo, substituir/adicionar
   exercício, pausa/cancelamento, timer, SQLite e recuperação/reenvio idempotente.
6. **Conclusão e histórico**: finalização transacional, volume, PRs básicos, detalhe de
   sessões antigas e dashboard semanal real. Testar duplo finish e falha de rede.
7. **Validação V1**: fluxo completo em Android/iOS, acessibilidade, erros/loading/empty,
   isolamento, recuperação offline, documentação e screenshots para portefólio.

V2 progresso/analytics; V3 nutrição; V4 recomendações determinísticas/insights; V5 AI com
dados autorizados; V6 integrações e acabamento adicional. Nenhuma destas é implementada em M1.

## Decisões a fixar cedo

- kg/cm como unidades canónicas; preferências de apresentação separadas. Distinguir carga
  externa, peso corporal e assistência. Mostrar convenção por exercício (halter por mão,
  por exemplo) para não comparar números incompatíveis.
- Epley: `peso × (1 + reps/30)` para 2–10 reps, uma rep = peso. Estimativa, não medição.
  Apenas working sets concluídos com carga externa positiva para PR de e1RM inicial;
  warmups excluídos. Reps record agrupado por carga canónica exata. Empates não são PRs.
- Volume inicial = soma carga externa × reps dos working sets concluídos; não inferir
  carga corporal. Sets por músculo primário; secundários apresentados separadamente,
  evitando duplicar o total. Recalcular derivados após correções do histórico.
- Datas de nutrição e semana usam timezone IANA do utilizador, semana começa segunda;
  timestamps persistidos em UTC. `date` do diário não muda por viajar de timezone.
- Histórico preserva snapshots: editar template, exercício ou alimento não reescreve o passado.
- Uma sessão ativa/pausada por utilizador, imposta por índice parcial. Não deixar isto só na UI.
- Dados e fotografias privados; fotos em object storage com URLs assinados, nunca blob na BD.
  Eliminar conta deve também agendar remoção de objetos. Retenção/backups a definir antes de deploy.
- Dependências introduzidas quando usadas. Navegação em M2; SQLite em M5; gráficos em V2.
  Lockfiles versionados. Recomenda-se Node LTS em desenvolvimento/CI.

## Referências técnicas

- [Templates Expo](https://docs.expo.dev/more/create-expo/)
- [TypeScript no Expo](https://docs.expo.dev/guides/typescript/)
- [Settings FastAPI](https://fastapi.tiangolo.com/advanced/settings/)
- [SQLAlchemy relationships](https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html)
