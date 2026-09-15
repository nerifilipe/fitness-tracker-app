# M8 — Nutrição com poucos passos

## Fluxo disponível

No separador **Nutrição**, tocar em **Adicionar alimento**, pesquisar pelo nome ou
marca, escolher o resultado e confirmar a quantidade. Calorias, proteína, hidratos
e gordura vêm preenchidos pelo Open Food Facts e são ajustados à quantidade.

- **Recentes** abrem com a última quantidade usada. Importar o mesmo código volta a
  usar o alimento já guardado nessa conta.
- **Favoritos** guardam os alimentos habituais com a estrela no ecrã da porção.
- **Porções rápidas**: meia, uma ou duas porções quando a fonte dá uma medida em g/ml;
  caso contrário, atalhos de 50, 100, 150 e 200 g/ml. A quantidade é sempre editável.
- **Repetir de outro dia** mostra os alimentos da refeição de origem antes de os
  acrescentar à refeição atual. Conserva os valores e quantidades desse registo.
- Tocar num alimento no diário permite editar a quantidade/refeição ou remover.
- Setas de dia permitem consultar e registar dias anteriores. Hoje segue o fuso do
  perfil. Os objetivos são opcionais, definidos pelo utilizador e não prescritos.
- A Home mostra calorias e proteína do dia com ligação ao diário.
- Criar um alimento manualmente é uma alternativa para produtos ausentes. Fica na
  biblioteca pessoal para não ser necessário voltar a escrever os valores.

## Fonte e disponibilidade

Integração de leitura com [Open Food Facts](https://world.openfoodfacts.org), dados
sob [ODbL](https://opendatacommons.org/licenses/odbl/1-0/) e conteúdos individuais
sob [DbCL](https://opendatacommons.org/licenses/dbcl/1-0/). A interface identifica a
fonte e liga à página do produto. A licença MIT do código não altera a licença dos
dados importados. Não são distribuídas fotografias nem uma cópia do catálogo.

A [documentação oficial da API](https://openfoodfacts.github.io/openfoodfacts-server/api/)
indica que `/api/v2/search` não faz pesquisa livre. O adaptador usa `/cgi/search.pl`
para texto e `/api/v3/product/{code}` para obter um produto que já saiu da cache.
Envia preferência de idioma/região PT, mas a cobertura e os nomes dependem do catálogo.
A pesquisa inclui produtos de outros países. Confirmar sempre a variante na embalagem.

Não se envia identidade, token, objetivos ou diário ao fornecedor: apenas pesquisa,
página e código de produto. User-Agent identificável, substituível por `FOOD_USER_AGENT`
no backend. Não requer chave de API. Não há novos pacotes instalados.

A pesquisa é explícita pelo botão/teclado, não a cada letra. Cache em memória de 15
minutos e 256 entradas. Limites globais por processo: 10 pesquisas e 15 consultas de
produto por minuto; timeout de 7 segundos e limite de 2 MB por resposta. Para vários
workers/instâncias, substituir este limite por um coordenador partilhado por IP de
saída antes de escalar. A indisponibilidade externa aparece como erro, não como uma
lista vazia. Recentes e favoritos dependem apenas da API/BD da app.

Produtos sem os quatro valores nutricionais completos não são apresentados. Zero
explícito é válido; valor ausente não é convertido em zero. kcal têm prioridade;
kJ são convertidos por 4,184 quando necessários. As chaves OFF `*_100g` também podem
representar 100 ml: usamos as unidades disponíveis no produto/porção. Uma porção em
“cup” ou “unidade” sem equivalência explícita não é convertida por aproximação.

## Persistência e contrato

Migração aditiva `0005_nutrition`:

- `nutrition_foods`: biblioteca por utilizador, snapshot normalizado da fonte,
  favorito, quantidade e instante do último uso; código externo único por conta.
- `nutrition_entries`: dia, refeição, quantidade e snapshot nutricional do registo.
  Índice por conta/dia; remoção lógica evita ressuscitar um registo numa nova tentativa.
- `nutrition_goals`: objetivos atuais por conta. Estes mesmos objetivos aparecem ao
  consultar dias passados; ainda não há histórico de alterações de objetivos.
- `nutrition_copies`: comprovativos de cópia por conta/UUID com o pedido original.

As rotas autenticadas estão em `/api/v1/nutrition`: `search`, `foods`, `foods/import`,
`foods/{id}/favorite`, `diary`, `goals`, `entries/{id}` e `meal-copies/{id}`.
Contrato em `docs/openapi.json`; tipos mobile gerados a partir dele.

As quantidades usam Numeric(12,3). A API calcula os resultados com Decimal e arredonda
a duas casas apenas na resposta. O total diário soma os valores antes de arredondar.
Editar/copy mantém o snapshot do registo, mesmo se o catálogo for alterado entretanto.
Um dia admite até 200 alimentos; recentes/favoritos devolvem até 50 alimentos.

Guardar uma entrada usa PUT com UUID estável enquanto o formulário está aberto, para
repetir após perda de resposta sem criar outro alimento. A cópia é atómica e repetível
com o mesmo UUID; reutilizá-lo com outro pedido devolve conflito. Operações de escrita
da mesma conta são serializadas. Os dados de outras contas não ficam acessíveis por ID.

## Como executar

Com PostgreSQL ativo, na raiz:

```powershell
backend/.venv/Scripts/python -m alembic -c backend/alembic.ini upgrade head
```

Reiniciar a API e abrir/recarregar o Expo. Não é necessário alterar o URL usado pelo
telemóvel nem instalar dependências novas. No separador Nutrição, pesquisar “iogurte”,
escolher um produto e confirmar a porção. Guardar como favorito, voltar a adicioná-lo
nos Recentes e usar “Repetir de outro dia” para reutilizar uma refeição.

## Verificação e limites desta entrega

Os testes específicos cobrem pesquisa/cache/importação, unidade g/ml, dados incompletos,
timeouts, rate limit, favoritos, porções, totais, edição e snapshots, cópia/retry,
remoção/retry, isolamento entre contas, objetivos, fuso e quantidades inválidas.
Testes mobile cobrem entrada decimal portuguesa, cálculos, datas e estabilidade do
pedido de gravação. Consultas reais de leitura ao ambiente staging do Open Food Facts
devolveram 18 produtos utilizáveis para “yogurt” e 20 para “iogurte”.

Resultados: **16 testes backend passaram** (12 de nutrição e 4 de saúde da API),
**4 testes mobile passaram**, TypeScript e Ruff passaram, exportação Android passou.
A migração foi aplicada à BD local; `alembic check` não encontrou diferenças entre
o schema e os modelos. Não foi repetida a suite completa de treino nesta entrega.

O diário de nutrição requer ligação à API: não tem ainda fila SQLite para gravação
offline. O UUID do formulário não persiste após fechar a aplicação. Após uma interrupção
nesse momento, consultar o diário antes de voltar a adicionar. Não foram repetidos os
testes no telemóvel nem alegada validação visual destes novos ecrãs.

Próximo passo: uma passagem curta no telemóvel para confirmar pesquisa, porções e
repetição de refeições. Scanner de códigos, receitas guardadas com nome e sincronização
offline da nutrição ficam para uma extensão posterior.

Commit sugerido: `feat(nutrition): add food search, quick portions and meal diary`
