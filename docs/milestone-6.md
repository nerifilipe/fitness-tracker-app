# M6 — Conclusão, histórico e resultados

## Entrega

O treino ativo tem **Finalizar treino**, com confirmação das séries concluídas e das
séries que ficam por realizar. Exige pelo menos uma série concluída. Finalizar durante
uma pausa desconta essa pausa, fixa o fim e termina o descanso. O treino fica fechado
para edição após confirmação do servidor; não existe edição/apagamento de histórico
nesta etapa.

A conclusão é persistida no SQLite antes de aparecer no ecrã e usa a fila de M5.
Sem rede aparece **Conclusão por sincronizar**, acessível também pelo banner na Home
e em Workout. Sincronizar/reabrir a app reenvia o mesmo mutation_id e corpo persistido.
Uma resposta de edição anterior não substitui uma conclusão feita durante esse envio.
O botão **Ver resumo** só aparece quando a revisão final está confirmada.

O histórico é acessível pela Home e por Workout. Tem paginação de 20 sessões,
atualização por gesto/botão e datas opcionais AAAA-MM-DD (início e fim inclusivos).
Respostas tardias após mudança de filtros/saída do ecrã são ignoradas. O detalhe mostra
snapshots, séries realizadas/não realizadas, RIR, notas, resumo e marcas pessoais.
Histórico e resumos requerem ligação; esta etapa não acrescenta uma cache offline de
sessões antigas. O agregado local de M5 continua compatível (schema 1).

A Home mostra treinos/objetivo semanal, distribuição nos sete dias, séries, tempo ativo,
volume e três sessões recentes. Semana de segunda a domingo no fuso IANA do Perfil.
As contagens podem ultrapassar o objetivo; apenas a barra visual é limitada a 100%.
Loading, falha de rede e ausência de resultados têm estados separados.

## Regras dos resultados

- Apenas treinos concluídos e sincronizados entram no histórico/dashboard/PRs.
  Treinos ativos, pausados e cancelados ficam excluídos.
- Tempo ativo = segundos inteiros entre início/fim menos pausas acumuladas.
- Séries concluídas incluem trabalho e aquecimento. Exercícios contam blocos com
  pelo menos uma série concluída; um exercício repetido em dois blocos conta duas vezes.
  Séries incompletas mantêm-se no detalhe, sem contribuir para as métricas.
- Volume = soma de carga registada × repetições das séries de trabalho concluídas com
  carga externa, em kg·reps. Não estima carga corporal, não inclui assistência e não
  duplica valores por mão. A UI continua em kg, como o registo de M5.
- PR de repetições compara a mesma carga decimal exata, exercício e convenção de carga.
- PR de 1RM estimado usa Epley para 2–10 reps; uma repetição usa a própria carga.
  Arredondamento decimal a 0,01 kg. Exige carga externa positiva e série de trabalho
  concluída. Não representa uma medição de 1RM.
- Compara apenas sessões anteriores da conta, ordenadas por (started_at,id), e separa
  convenções de carga. Empates não são PRs. Sem marca anterior, apresenta **Primeira marca**.
  Treinos posteriores não reescrevem conquistas antigas. Uma sessão antiga que só seja
  sincronizada mais tarde pode alterar a comparação das sessões posteriores.
- Datas de histórico, dias e semanas usam o início da sessão convertido para o fuso do
  Perfil. Uma sessão que atravesse a meia-noite pertence ao dia em que começou.

## API e persistência

| Método | Endpoint | Comportamento |
|---|---|---|
| PUT | `/api/v1/workouts/{id}` | Aceita também completed, finished_at e séries; transação e recibo idempotente de M5 |
| GET | `/api/v1/workouts/{id}/summary` | Snapshot completo, métricas e marcas; 409 se ainda não concluído |
| GET | `/api/v1/workouts/history` | Filtros date_from/date_to, cursor e limit 1–50; ordenação decrescente (started_at,id) |
| GET | `/api/v1/workouts/dashboard` | Semana atual, objetivo do Perfil, sete dias e três sessões recentes |

Todos os endpoints exigem autenticação, filtram pela conta e usam Cache-Control: no-store.
Um resumo alheio devolve 404. Intervalos inválidos e cursores malformados devolvem 422.
Datas de filtro suportadas: 1900–9998, evitando extremos incompatíveis com conversões
de fuso e cálculo do dia seguinte.

Não há nova migração, dependência ou tabela de estatísticas. A migração 0004 já permite
completed; os resultados são derivados das tabelas de treinos/séries. As consultas de
resumo/histórico agregam séries em SQL e os PRs consultam máximos anteriores agrupados.
O desempenho com anos de histórico e o layout no limite de 50 exercícios precisam de
medição em M7/antes de escalar. Contrato OpenAPI e tipos TypeScript atualizados juntos.

## Verificação

- Backend: 70 testes passaram, incluindo concorrência com a mesma chave e chaves
  diferentes, replay de finalização, fechamento imutável, datas inválidas, autorização,
  isolamento, snapshots, volume decimal, exclusões de PR, empates, paginação com datas
  repetidas e semana da mudança de hora em Europe/Lisbon.
- Mobile: 53 testes passaram. Incluem conclusão sem rede e reinício, corpo de replay
  inalterado, conclusão durante outro envio, correção após rejeição definitiva,
  pausas/descanso, validação de datas, paginação, retry e respostas tardias.
- TypeScript, Ruff e Alembic check passaram. Não há migrações em falta.
- Bundles Android/iOS exportados com sucesso. A exportação não substitui verificação
  visual em dispositivo; a validação manual dos novos ecrãs no telemóvel está pendente.

## Experimentar no telemóvel / M7

Reiniciar a API se estiver sem --reload e atualizar a aplicação no Expo Go. Não é
necessário limpar o SQLite, recriar a BD ou voltar a instalar dependências para M6.

1. Iniciar plano; concluir algumas séries e deixar outras por realizar; finalizar.
   Confirmar resumo, notas, contagens, carga e convenção. Voltar à Home e ao histórico.
2. Repetir o exercício com mais repetições à mesma carga; confirmar novo PR. Empatar
   não deve gerar um novo recorde. Aquecimentos não devem aumentar volume/PRs.
3. Iniciar com rede; desligar rede, concluir/finalizar e fechar o Expo Go. Reabrir,
   verificar conclusão pendente, ligar rede e sincronizar. Deve existir uma só sessão.
4. Finalizar enquanto uma sincronização está em curso. Confirmar que a conclusão
   sobrevive à resposta anterior e que o resumo só abre depois da confirmação final.
5. Pausar, esperar e finalizar; verificar tempo ativo. Cancelar outra sessão e confirmar
   que não entra no histórico nem no objetivo semanal.
6. Filtrar datas, atualizar, carregar mais e abrir detalhes; testar erro de rede e retry.
   Alterar fuso/objetivo no Perfil e confirmar a Home.
7. Verificar Android/iOS, fonte aumentada, leitor de ecrã, teclado, botões e navegação.
   Capturar screenshots para portefólio depois da validação visual.

Commit sugerido: `feat: complete M6 workout history, summaries and weekly dashboard`
