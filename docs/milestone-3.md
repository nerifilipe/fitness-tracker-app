# M3 — Biblioteca de exercícios

## Criado

- Catálogo inicial de 24 exercícios e 10 grupos musculares, com nomes de exercícios em inglês
  e interface em português. Seed local, sem dados de contas fictícias ou API externa.
- Pesquisa por nome, filtro por músculo principal/equipamento e vistas Todos/Favoritos/Meus.
- Paginação por cursor (20 por página no mobile, limite API 1–50), ordenada por lower(name)/UUID.
- Detalhe com músculos, equipamento e convenção de carga. Favoritos independentes por conta.
- Exercícios personalizados: criar/editar nome, equipamento, músculo principal, até 8 secundários,
  carga e notas/instruções opcionais. Não podem ser lidos nem alterados por outra conta.
- Arquivo com confirmação: oculta o exercício da biblioteca preservando a entidade e relações.
- Tab Workout com stack Biblioteca → Detalhe → Editor; acesso à biblioteca pela Home.
- ChoiceField reutilizável com modal e seleção simples/múltipla; Screen suporta header nativo.
- Nenhuma nova dependência. Tipos OpenAPI atualizados e cliente HTTP autenticado reutilizado.

## Base de dados e invariantes

Migração `0002_exercises` cria muscle_groups, exercises, exercise_muscles e user_exercises.
Catálogo global tem owner_id NULL; custom tem proprietário obrigatório atribuído pelo servidor.
O payload não aceita owner_id. GET/PUT/DELETE/favorito de exercício privado alheio devolvem 404.
Editar/arquivar catálogo global devolve 403. Todas as respostas usam Cache-Control: no-store.

Um músculo primário é obrigatório e os secundários não o podem repetir. A transação do serviço
substitui as relações; um índice parcial impede dois primários e a PK composta impede duplicados.
Carga externa permite total/per_hand; peso corporal permite none/added; assistência exige
assistance. Estas combinações são validadas em Pydantic e por CHECK no PostgreSQL.

FK exercises.owner_id usa RESTRICT, evitando converter um exercício privado em global ao apagar
conta. Junções/favoritos usam CASCADE; muscle_groups referenciados usam RESTRICT. O arquivo não
apaga sets/histórico futuros. Sem restore pela UI nesta milestone. Editar é last-write-wins;
versionamento e snapshots de sessões entram com workout tracking.

O seed usa UUIDs estáveis e INSERT ON CONFLICT DO NOTHING. É insert-only: não atualiza exercícios
existentes nem desfaz arquivos. Novas alterações ao catálogo existente terão de ser explícitas.
Não executa automaticamente ao arrancar a API, nem cria tabelas fora do Alembic.

## API

| Método | Caminho sob /api/v1 | Resultado |
|---|---|---|
| GET | /exercises/muscle-groups | Grupos para filtros/formulários |
| GET | /exercises | items + next_cursor; q, muscle_id, equipment, favorites_only, custom_only, limit, cursor |
| POST | /exercises | Cria exercício privado, HTTP 201 |
| GET | /exercises/{id} | Detalhe autorizado, incluindo estado de favorito |
| PUT | /exercises/{id} | Substitui os campos editáveis de exercício próprio |
| DELETE | /exercises/{id} | Arquiva; repetição pelo dono continua a devolver 204 |
| PUT | /exercises/{id}/favorite | Define is_favorite explicitamente; operação idempotente |

Pesquisa não distingue maiúsculas/minúsculas; `%` e `_` são tratados literalmente. Não há
normalização de acentos nesta versão. O filtro de músculos usa apenas o principal.
Cursor com UUID e chave de ordenação codificada em UTF-8; suporta nomes Unicode sem exceder
o tamanho permitido. Os mesmos filtros de propriedade são aplicados em todas as páginas.
Alterações ao catálogo durante paginação não têm snapshot: atualizar a lista reflete o estado atual.
O cliente elimina IDs duplicados ao juntar páginas.

## Testes executados

- **26 testes backend** passaram num schema PostgreSQL isolado: seed repetível, paginação,
  filtros, caracteres especiais/Unicode, visibilidade, catálogo imutável, favoritos por conta,
  edição de músculos, arquivo e dados inválidos, além dos testes de autenticação anteriores.
- **12 testes mobile** passaram: 8 de sessão e 4 da biblioteca, cobrindo pesquisas atrasadas,
  cancelamento, paginação concorrente, deduplicação e recuperação após falha de rede.
- TypeScript strict, Ruff e `alembic check` passaram. Bundles Android/iOS gerados.
- Falta teste visual/interação em dispositivo: modal de seleção, teclado, Back e leitor de ecrã.
  Não foi efetuado deploy. Os avisos transitivos já documentados em M2 continuam aplicáveis;
  não houve alterações de dependências nesta milestone.

## Executar e verificar

Na raiz, com PostgreSQL ativo:

```powershell
backend/.venv/Scripts/python -m alembic -c backend/alembic.ini upgrade head
backend/.venv/Scripts/python backend/scripts/seed_exercises.py
```

Iniciar API/Expo conforme README. No Expo Go: Home → Explorar exercícios, ou tab Workout.
Pesquisar, combinar filtros, carregar página seguinte, guardar/remover favorito, criar e editar
exercício próprio. Arquivar com confirmação. Entrar noutra conta e verificar privacidade.
Desligar rede durante pesquisa/paginação e testar “Tentar novamente”; mudar rapidamente de
filtros para verificar que resultados anteriores não substituem os atuais.

## Ficheiros principais

`backend/app/modules/exercises/{models,schemas,service,router,seed}.py`,
`backend/migrations/versions/0002_exercises_exercise_library.py`,
`backend/scripts/seed_exercises.py`, `backend/tests/test_exercises.py`,
`mobile/src/features/exercises/{api,labels,library}.ts`,
`mobile/src/screens/Exercise{Library,Detail,Editor}Screen.tsx`,
`mobile/src/navigation/WorkoutNavigator.tsx`, `mobile/src/components/ui/ChoiceField.tsx`,
`mobile/tests/library.test.ts`, `docs/openapi.json` e tipos gerados.

O diagnóstico de ligação da Home foi substituído pelo acesso à biblioteca; o hook/cliente
específicos desse botão foram removidos, mantendo o cliente HTTP comum e health endpoints.

## Próximo passo

M4 — templates: criar/renomear/duplicar templates, adicionar/remover/reordenar exercícios e
definir sets planeados. O treino ativo e a persistência de rascunhos continuam reservados à M5.
