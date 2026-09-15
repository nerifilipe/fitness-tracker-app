# M10 — Evolução da força por exercício

## Fluxo

Em **Progresso → Ver evolução da força**, escolher um exercício do histórico. Também
há um atalho na ficha de cada exercício da biblioteca. Não se introduzem novos dados:
os gráficos, recordes e comparações usam os treinos já concluídos e sincronizados.

- Pesquisa e lista paginada dos exercícios efetivamente treinados, com número de
  sessões e data da última. Exercícios arquivados continuam disponíveis nesta lista.
- Gráfico de 1RM estimado nos últimos 30/90/365 dias, com o melhor valor de cada dia.
- Recordes de todo o histórico: maior carga, melhor 1RM estimado e maior número de
  repetições à maior carga utilizada na última sessão. Cada recorde liga ao treino.
- Comparação automática entre as duas sessões mais recentes da mesma convenção:
  1RM estimado quando ambos existem, carga máxima, total de reps e número de séries.
- Histórico completo, paginado em 20 sessões, com cargas/repetições/RIR por série e
  ligação ao resumo completo do treino. As séries expandem-se num toque.

O período selecionado afeta apenas o gráfico. Recordes e últimas duas sessões usam
todo o histórico, indicado no ecrã. O nome atual do exercício identifica a evolução;
os treinos e as convenções de carga preservam os seus snapshots.

## Regras dos cálculos

Só contam séries **working**, concluídas, de treinos com estado **completed**.
Aquecimentos, séries por concluir e treinos ativos/cancelados ficam excluídos. Se um
exercício aparecer em vários blocos do mesmo treino, as séries são agregadas numa
sessão; o treino não é contado duas vezes.

Cada combinação `(exercise_id, load_type_snapshot, load_convention_snapshot)` tem
histórico, comparação e recordes separados. Quando existem várias, o utilizador pode
escolher a convenção; inicialmente é selecionada a mais recentemente usada. Valores
por mão não são multiplicados por dois.

O cálculo de 1RM reutiliza a expressão SQL dos relatórios M6, agora extraída para
`estimated_expression()`:

- Apenas carga externa positiva e 1–10 repetições.
- Uma repetição usa a própria carga.
- Duas a dez: `carga × (1 + reps / 30)`, arredondado a duas casas decimais.
- Ausência de série elegível produz null; não é representada como zero.

O gráfico agrega por dia local do fuso do perfil, mantendo o máximo elegível do dia.
Duas sessões no mesmo dia aparecem separadamente no histórico, ordenadas por
`(started_at, id)`. O gráfico reutiliza o componente M9 com espaçamento temporal real.

Peso corporal e assistência apresentam histórico de cargas/reps e um gráfico do
maior número de repetições numa série em cada dia. Não recebem 1RM, volume externo
nem recordes de carga externa. A assistência é identificada explicitamente: aumentar
a assistência não é apresentado como uma melhoria de força.

Os recordes guardam a série e o treino que os sustentam. Empates conservam a primeira
ocorrência cronológica. O recorde de repetições usa a carga decimal exata, sem agrupar
cargas arredondadas. A interface respeita kg/lb do perfil e mostra cargas com até três
casas decimais. As comparações informam que as sessões podem ter números de séries
diferentes; não há recomendações automáticas de carga nesta entrega.

## Implementação

Rotas autenticadas, só de leitura, em `/api/v1/progress/strength`:

| Rota GET | Resultado |
|---|---|
| /exercises?q=&cursor=&limit=20 | Exercícios do histórico da conta |
| /{exercise_id}?days=90&load_type=&load_convention= | Gráfico, grupos, recordes, últimas sessões |
| /{exercise_id}/sessions?load_type=&load_convention=&cursor=&limit=20 | Sessões da convenção selecionada |

Todas as consultas estão limitadas à conta autenticada. Exercícios personalizados de
outra conta não podem ser consultados por ID. A paginação usa cursores determinísticos;
os detalhes das séries da página são obtidos numa consulta conjunta. O período do
gráfico está limitado a 365 dias. Não há tabela de gráficos, migração, seed, escrita
nos treinos anteriores ou nova dependência.

Principais ficheiros:

- `backend/app/modules/progress/strength.py`, `strength_schemas.py` e `strength_router.py`.
- `backend/app/modules/workouts/reports.py`: expressão de 1RM partilhada.
- `mobile/src/screens/StrengthLibraryScreen.tsx`, `ExerciseStrengthScreen.tsx` e
  `StrengthHistoryScreen.tsx`.
- `mobile/src/features/progress/strengthApi.ts`, `strengthHelpers.ts` e
  `StrengthSessionCard.tsx`.
- Contrato OpenAPI e tipos mobile gerados em conjunto.

## Verificação e utilização

23 testes backend passaram: novos cenários de força e regressão dos relatórios de
treino. Cobrem exclusões, convenções separadas, precisão do 1RM, repetições à carga
exata, vários blocos do mesmo exercício, empates, sessões simultâneas, datas locais,
paginação, exercícios arquivados e isolamento entre contas. TypeScript e Ruff passaram.

9 testes mobile passaram nesta passagem (3 de força e 6 de progresso): comparação
com valores ausentes, convenções, unidades, parâmetros da API e geometria do gráfico.
A exportação Android pelo Expo também terminou com sucesso.
A validação visual no telemóvel continua pendente; não foi alegada validação nativa.

Reiniciar a API e recarregar o Expo. Abrir **Progresso → Ver evolução da força** e
selecionar um exercício. Com duas sessões concluídas já aparece a comparação. Com
apenas uma, o ecrã indica que falta outra. Se a lista estiver vazia, concluir e
sincronizar um treino com uma série de trabalho.

Próximo passo: confirmar este fluxo no telemóvel junto com M8/M9. A fase seguinte
poderá acrescentar sugestões de progressão, mantendo-as distintas dos dados registados.

Commit sugerido: `feat(progress): add exercise strength trends and session comparisons`
