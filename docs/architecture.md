# Arquitetura e plano de produto

## Auditoria inicial

Em 13/09/2026, o repositório continha apenas README.md, .gitignore e LICENSE (MIT).
Não existiam aplicações, dependências, testes, dados, AGENTS.md ou código a migrar.
A licença é preservada e o ignore é complementado para Python/Expo.

## Estado atual — M12

Estão implementados autenticação, biblioteca, planos, treino com recuperação local,
histórico, nutrição, medidas corporais, evolução da força e sugestões de progressão.
A API está publicada no Render com PostgreSQL Neon; o APK Android foi gerado pelo
Expo EAS e o utilizador confirmou a instalação e o funcionamento. Os detalhes da
entrega e os limites de validação estão em [M12](milestone-12.md).

O plano inicial foi concretizado nas milestones M1–M12. As propostas futuras são
identificadas separadamente; não fazem parte da aplicação entregue.

## Estrutura implementada

```text
mobile/
  App.tsx
  src/
    navigation/             # stack de autenticação, tabs e treino fullscreen
    screens/                # home, workout, history, profile, progress e nutrition
    components/ui/          # primitivas do design system
    features/               # auth, exercises, templates, workouts, history, nutrition, progress
    hooks/
    services/api/           # HTTP e tipos gerados do OpenAPI
    theme/
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
      templates/            # prescrição de treino (M4), separada da execução
      workouts/
      progress/             # medidas corporais e consultas de evolução da força
      nutrition/            # diário, alimentos, objetivos e Open Food Facts
  migrations/               # Alembic 0001–0006
  scripts/                  # configuração, seed, contrato e publicação
  tests/
docs/
compose.yaml
compose.release-test.yaml
render.yaml
```

Monólito modular:
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
Contrato implementado em M2; health/readiness continuam sem expor dados pessoais.

Estado M2: identidade implementada (ver milestone-2.md). Erros de validação agora usam
o mesmo envelope de erro, omitindo inputs para não devolver passwords/tokens em respostas.
Detalhes de campos não são incluídos nesta versão. Perfil usa PUT completo de preferências.

O cliente usa fetch inicialmente. Tipos OpenAPI gerados em M2 para impedir divergência.
Requests de escrita nunca são repetidos cegamente: UUID criado no dispositivo e chaves
de idempotência para criação/finalização de treino. Atualização com `version` e 409 em
conflito. O servidor calcula volume/PRs e finaliza em transação.

Treino ativo tem rascunho persistido em SQLite por utilizador a cada alteração (M5),
independente da navegação e com recuperação após reinício. Fila limitada ao treino ativo,
sem implementar sincronização geral. Flush/retry explícito ao recuperar rede. Mostrar
estado pendente; só confirmar sincronização após resposta do servidor. Cronómetro baseado
em timestamps, não em número de ticks; pausa acumula duração e descanso guarda deadline.

Estado M6: escrita SQLite síncrona de um agregado limitado ao treino, com WAL e synchronous=FULL,
antes de publicar a alteração na UI. O pedido pendente e a sua revisão também são persistidos
antes do envio; uma resposta antiga nunca substitui edições locais mais recentes.
Conflitos entre dispositivos preservam a cópia local e pedem resolução explícita.
SecureStore guarda refresh e identidade em cache no mesmo envelope; access continua só
em memória. A cache permite abrir o treino offline, sem contornar autenticação no servidor.
Detalhes da recuperação em milestone-5.md. M6 usa a mesma fila para finalizar com
`status=completed`; só publica acesso ao resumo após confirmar a revisão no servidor.
O histórico é paginado por (started_at,id), com datas no fuso do Perfil. Resumos, volume,
PRs e dashboard são calculados no backend, sem cache de métricas nem dados fictícios.
Regras, limites e testes em milestone-6.md.

## Navegação e experiência

Tabs atuais: Home / Workout / Progress / Nutrition / Profile. Histórico acessível
por Workout e Home; biblioteca e editor de template num stack. Treino ativo em
stack fullscreen, com acesso rápido à sessão em curso. Progresso inclui medidas
corporais e evolução da força; Nutrição inclui diário e pesquisa de alimentos.

Autenticação num stack separado. No treino: tabela editável, teclado numérico, último
resultado por exercício, conclusão de set com um toque, descanso automático ajustável,
ações secundárias em menu e confirmação para cancelar. Back não elimina rascunho.
Home mostra apenas dados reais e estados vazios úteis; sem métricas fictícias.

React Navigation (native stack + bottom tabs), introduzido em M2, com parâmetros
tipados e sem necessidade de rotas por ficheiro.

## Design system inicial

Dark principal: fundo #0B0F14, superfície #151C25, borda #2C3949; texto #F4F7FA,
secundário #A8B5C4, ação lima #C7F36B com texto #142006; erro #FF9A9A.
Spacing 4/8/12/16/24/32/48; raios 12/20; fonte nativa para evitar downloads.
Tipografia 12 (label), 16 (body), 20 (section), 32 (title); números tabulares.
Touch targets ≥48, labels acessíveis, suporte a font scaling, safe areas e teclado.
Button, Card, Input, Modal, Icon, loading/empty/error partilham tokens. Criar apenas
primitivas usadas na milestone. Ícones de uma única família ao introduzir navegação.
Animações curtas 150–220ms respeitam reduced motion; nunca atrasam registo de sets.

## Milestones e âmbito

Os pontos abaixo descrevem o âmbito de cada milestone. As evidências de validação
e as pendências constam dos respetivos documentos; a lista não implica que todos
os critérios tenham sido testados em todos os dispositivos.

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

8. **Nutrição**: diário com pesquisa Open Food Facts, recentes, favoritos, porções,
   objetivos e cópia de refeições. Ver [M8](milestone-8.md).
9. **Medidas corporais**: peso, medidas, histórico editável e gráficos. Ver [M9](milestone-9.md).
10. **Evolução da força**: gráficos, recordes e comparação entre sessões a partir
    dos treinos concluídos. Ver [M10](milestone-10.md).
11. **Progressão**: sugestões determinísticas e preenchimento das séries com opção
    de desfazer. Ver [M11](milestone-11.md).
12. **Distribuição Android**: API Render, PostgreSQL Neon e APK Expo EAS, com
    instalação e funcionamento confirmados pelo utilizador. Ver [M12](milestone-12.md).

AI, integrações externas adicionais, fotografias e publicação nas lojas continuam
fora da entrega atual. O plano inicial de versões V2–V4 foi concretizado em M8–M11.

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
- Dados privados por conta. Fotografias ainda não estão implementadas; se forem
  acrescentadas, usar object storage e definir acesso, retenção e remoção dos objetos.
  Exportação de dados, eliminação de conta e recuperação de backups não fazem parte
  dos fluxos documentados desta entrega.
- Dependências introduzidas quando usadas. Navegação em M2; SQLite em M5; gráficos em V2.
  Lockfiles versionados. Recomenda-se Node LTS em desenvolvimento/CI.

## Referências técnicas

- [Templates Expo](https://docs.expo.dev/more/create-expo/)
- [TypeScript no Expo](https://docs.expo.dev/guides/typescript/)
- [Settings FastAPI](https://fastapi.tiangolo.com/advanced/settings/)
- [SQLAlchemy relationships](https://docs.sqlalchemy.org/en/20/orm/basic_relationships.html)
