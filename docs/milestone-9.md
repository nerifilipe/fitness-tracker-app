# M9 — Peso, medidas e evolução

## Entrega

Novo separador **Progresso** entre Workout e Nutrição. Para registar hoje basta tocar
em **Registar peso**, preencher um valor e guardar. Cintura, peito, braço, coxa e notas
são opcionais e ficam numa secção que se pode expandir. Também é possível guardar só
uma medida corporal sem peso. Não são preenchidos valores presumidos.

O gráfico acompanha peso ou qualquer uma das quatro medidas, com períodos de 30 dias,
90 dias e um ano. Mostra o último valor conhecido com a sua data e a diferença entre
o primeiro e o último registo efetivo do período. Um registo isolado não produz uma
variação. Uma medição de cintura antiga não desaparece quando se regista apenas peso.

Os pontos são espaçados pelos dias decorridos, não pelo índice na lista. Dias sem
registo não viram zero. A linha liga os pontos registados; não representa pesagens
diárias inferidas. A escala vertical adapta-se aos valores e é apresentada em texto.
Sem dados e com apenas um ponto há estados próprios. O gráfico usa componentes nativos
React Native, sem nova biblioteca, e tem resumo acessível; os valores individuais
estão disponíveis no histórico.

O histórico mostra 20 dias por página, com botões para páginas anteriores/seguintes,
edição e remoção com confirmação. A data do formulário começa em hoje ou na data
escolhida no histórico. Pode ser alterada para outro dia através do botão de data;
se houver alterações por guardar, a mudança pede confirmação antes de descartá-las.

A Home inclui o último peso e a variação entre os registos dos últimos 30 dias. Se
o último registo for antigo, a data é mostrada. Erros de ligação não são apresentados
como ausência de dados nem como peso zero.

## Dados e regras

Migração aditiva `0006_progress`, tabela `body_measurements`:

- Chave primária `(user_id, date)`: um registo por conta/dia.
- Peso em kg; cintura, peito, braço e coxa em cm, com Numeric(7,3).
- Notas até 500 caracteres e timestamps de criação/alteração.
- Pelo menos uma medida obrigatória. Peso 1–500 kg; cintura/peito 1–400 cm,
  braço 1–200 cm e coxa 1–300 cm. Estes limites validam dados, não são objetivos.
- Datas válidas entre 1900 e o dia atual no fuso do perfil; não se registam medições
  futuras. Alterar o fuso posteriormente não desloca as datas já escolhidas.

A preferência de unidades do perfil é respeitada: kg/cm ou lb/in. A API usa sempre
unidades métricas. Conversões usam 1 lb = 0,45359237 kg e 1 in = 2,54 cm. O formulário
mantém o valor canónico original de campos não editados, evitando que abrir/guardar
um registo em unidades imperiais introduza arredondamentos cumulativos.

Rotas autenticadas em `/api/v1/progress`:

| Método e rota | Resultado |
|---|---|
| GET /summary?days=90 | Métricas atuais, variação no intervalo e pontos; days 1–365 |
| GET /measurements?before=AAAA-MM-DD&limit=20 | Histórico por data decrescente |
| GET /measurements/AAAA-MM-DD | Registo da conta nesse dia ou null |
| PUT /measurements/AAAA-MM-DD | Cria/substitui o registo completo desse dia |
| DELETE /measurements/AAAA-MM-DD | Remove apenas o registo da conta nesse dia |

Uma nova tentativa do PUT para a mesma data não cria duplicados. O editor carrega as
medidas existentes antes de guardar, conservando os campos não alterados. As escritas
da mesma conta são serializadas; entre edições distintas, a última gravação prevalece.
Não existe resolução de conflitos entre dispositivos nem fila de gravação offline.
Fechar o formulário antes de guardar não persiste um rascunho. Após uma falha de rede,
tentar novamente no mesmo formulário ou consultar esse dia no histórico.

O helper de mutações foi movido para `mobile/src/hooks/useMutation.ts`, mantendo a
exportação antiga da nutrição. O comportamento de bloqueio de duplo toque, erro e
proteção após desmontagem mantém-se partilhado pelos dois módulos.

## Verificação

- 13 testes backend: precisão e upsert, edição/remoção, limites do período, última
  medição independente por métrica, ausência de peso, paginação e isolamento de contas,
  campos inválidos, datas futuras e mudança de dia entre fusos.
- 6 testes mobile de progresso: vírgula decimal, opcionais, validação, conversão de
  unidades sem alterar valores intactos, datas e geometria com registos espaçados,
  série vazia, plana ou de um só ponto.
- Os 4 testes mobile de nutrição também passaram após partilhar o helper.
- TypeScript e Ruff passaram.
- Exportação Android passou. Migração aplicada à BD local; `alembic check` não
  encontrou diferenças entre os modelos e o schema.

Não se repetiram os testes no Android: o utilizador escolheu testar M8 pessoalmente
e avançar para M9. A compilação e os testes de lógica não substituem validação visual
nem com leitor de ecrã. Fotografias, gordura corporal estimada e analytics de força
ficam fora desta entrega.

## Executar e experimentar

Na raiz, com PostgreSQL ativo:

```powershell
backend/.venv/Scripts/python -m alembic -c backend/alembic.ini upgrade head
```

Reiniciar a API e abrir o Expo com a configuração habitual. Em **Progresso**, registar
o peso de hoje, abrir o histórico e acrescentar uma data anterior. Confirmar os pontos
no gráfico, editar uma das medidas e experimentar kg/lb nas preferências do perfil.
Não é necessária nenhuma nova dependência.

Próximo passo: uma passagem curta pelos fluxos de nutrição e progresso no telemóvel,
antes de acrescentar mais funcionalidades.

Commit sugerido: `feat(progress): add body measurements, weight charts and history`
