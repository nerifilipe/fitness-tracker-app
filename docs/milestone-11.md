# M11 — Sugestões de progressão no treino

## Utilização

Iniciar um treino e abrir as séries de um exercício. **Sugestão para hoje** mostra
a data, cargas e repetições da última sessão na mesma convenção. Uma explicação
acompanha a proposta de repetir, tentar mais uma repetição ou subir a carga.

O botão **Aplicar a N séries** preenche as séries indicadas na pré-visualização.
A carga e as repetições continuam editáveis. O RIR fica vazio para registar o esforço
real de hoje; nenhuma série é marcada como concluída. **Desfazer preenchimento**
restaura os valores anteriores apenas nas séries que ainda não foram alteradas ou
concluídas. A opção de desfazer mantém-se ao recolher/abrir o exercício, mas não é
persistida quando se sai deste ecrã ou se reinicia a app.

As cargas e os incrementos aparecem em kg, tal como os campos do treino ativo.
O histórico de Progresso continua a apresentar as unidades do perfil. Nos exercícios
por mão, o incremento é por mão, sem multiplicar a carga por dois.

## Regras v1

São regras explícitas do produto, ajustáveis pelo utilizador; não são uma previsão
de desempenho nem uma prescrição individualizada. Não usam 1RM para inferir esforço.
O RIR continua opcional: sem ele, a recuperação da última sessão funciona na mesma.

- Sem sessão anterior: manter os campos do plano e apresentar o estado vazio.
- Só são consideradas sessões iniciadas antes do treino atual, obtidas do histórico
  de treinos concluídos com séries de trabalho concluídas, na convenção exata.
- Histórico com mais de 28 dias, assistência, número de séries diferente, séries
  com cargas/reps diferentes, uma só série, RIR ausente ou alguma série com RIR < 2:
  propor repetir os valores anteriores.
- Com pelo menos duas séries iguais, mesmo número de séries no bloco atual e RIR
  ≥ 2 em todas as séries da última sessão recente: propor mais 1 repetição por série.
- Para propor carga, exigir duas sessões recentes com o mesmo número de séries,
  mesma carga e mesmas reps, e RIR ≥ 3 em todas. Apenas carga externa positiva.
  O incremento escolhido deve ser positivo e não ultrapassar 5% da carga anterior.
- Incrementos disponíveis: 0,5 / 1 / 1,25 / 2,5 / 5 kg. Inicialmente 1 kg por mão ou
  2,5 kg no total. Se o incremento exceder o limite, a proposta é acrescentar reps.
- Peso corporal progride apenas por reps. Assistência é repetida, sem aumentar
  automaticamente o esforço. Os limites dos campos de peso e reps são respeitados.

As séries são associadas pela posição entre séries de trabalho. Aquecimentos não
entram na contagem; séries concluídas mantêm a posição e os valores. Séries extra
sem correspondência no histórico ficam intactas. Vários blocos históricos do mesmo
exercício seguem a ordem agregada fornecida pelo M10; diferenças no número de séries
impedem sugerir progressão.

## Implementação e ligação

- `mobile/src/features/workouts/progression.ts`: decisão e aplicação/desfazer puros.
- `ExerciseSuggestion.tsx`: referência anterior, proposta, incremento e ações.
- `LiveExerciseCard.tsx` / `ActiveWorkoutScreen.tsx`: integração no treino existente.
- `strengthApi.recent`: reutiliza GET `/progress/strength/{id}/sessions`, com `limit=2`
  e `load_type`/`load_convention` dos snapshots do exercício.

O histórico só é pedido após a primeira abertura do exercício e pode ser atualizado
quando o ecrã recupera o foco. Respostas tardias são descartadas pelo hook existente;
a identidade do componente inclui treino, exercício e convenção. Não há pedidos a
cada atualização do cronómetro.

Consultar sugestões requer ligação. Se falhar, há uma ação de tentar novamente e
o registo normal do treino continua disponível. Os valores aplicados passam pelo
controlador existente: SQLite antes da publicação na interface e sincronização
idempotente. Reabrir offline recupera os valores já aplicados; não existe cache
persistente do histórico de sugestões. Falhas ao guardar não anunciam sucesso.
Pausa, conflitos, falhas de armazenamento e treino encerrado bloqueiam a aplicação.

Não há migração, alteração de backend/contrato OpenAPI ou dependência nova.

## Verificação

- TypeScript passou.
- 35 testes passaram: 10 novos de progressão, 22 do treino/controlador (incluindo
  um novo cenário de aplicação, reinício offline e sincronização) e 3 de força.
- Cobertura: ausência de histórico, RIR ausente/baixo, sessões antigas, consistência,
  convenções, limite do incremento, precisão decimal, limites de reps, aquecimentos,
  séries concluídas, séries extra, repetição do botão e proteção de alterações ao desfazer.
- Exportação Android pelo Expo terminou com sucesso.
- A validação visual no telemóvel continua pendente, junto com M8–M10.

Para verificar manualmente, recarregar o Expo e iniciar um plano com histórico.
Abrir um exercício, aplicar, editar uma série e desfazer: a série editada deve manter
os seus valores. Concluir uma série antes de aplicar deve preservá-la. Num exercício
novo deve aparecer o estado sem histórico. Confirmar também que o treino funciona
sem ligação e que valores previamente aplicados sobrevivem a um reinício.

Commit sugerido: `feat(workouts): suggest progression and prefill pending sets`
