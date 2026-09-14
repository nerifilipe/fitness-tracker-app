# M4 — Planos de treino

## Entrega

Workout abre agora a lista de planos da conta. Permite criar planos vazios ou completos,
renomear, editar, duplicar e apagar (arquivo). A biblioteca continua acessível nesta área.
Cada plano contém exercícios ordenados, incluindo repetições do mesmo exercício em blocos
distintos. Cada bloco tem descanso, notas e séries de aquecimento/trabalho com intervalo
de repetições, carga prevista em kg e RIR opcional. Exercícios e séries são ordenados
com botões Subir/Descer, sem depender de gestos de arrastar.

O editor abre um exercício de cada vez para configurar as séries, permite pesquisa e
seleção dos favoritos da biblioteca, e mantém os valores durante erros de gravação.
Ao sair com alterações por guardar pede confirmação. Durante a gravação bloqueia novas
ações e o retorno. A criação começa com três séries 8–12, descanso 90 s e carga/RIR por
definir; são valores editáveis, não uma recomendação de treino.

## Backend e contrato

Migração `0003_templates`, após `0002_exercises`, acrescenta apenas:

- `workout_templates`: dono, nome, versão, datas e arquivo.
- `workout_template_exercises`: ordem, referência ao exercício, descanso e notas.
- `workout_template_sets`: ordem, tipo, reps mín./máx., decimal para carga e RIR.

Endpoints autenticados em `/api/v1/workout-templates`:

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/` | Resumos e contagens, `offset`, `limit` 1–50 e `next_offset` |
| POST | `/` | Cria plano; devolve 201 e versão 1 |
| GET | `/{id}` | Detalhe ordenado |
| PUT | `/{id}` | Substitui nome/prescrição; `version` obrigatória no corpo |
| POST | `/{id}/duplicate` | Cópia profunda com novos IDs, nome com “(cópia)” e versão 1 |
| DELETE | `/{id}?version=N` | Arquiva e devolve 204 |

As rotas de coleção não precisam de barra final. OpenAPI e tipos TypeScript estão
sincronizados. Respostas privadas usam `Cache-Control: no-store`.

O dono vem da sessão, nunca do corpo. Todas as operações verificam a conta; UUIDs de
planos alheios devolvem 404. Referências a exercícios de outra conta/inexistentes são
rejeitadas sem revelar detalhes. Validação e gravação são transacionais. Ordem é derivada
dos arrays, com constraints únicas deferrable no PostgreSQL. A edição substitui os filhos;
os seus IDs não são identidades de sessões realizadas e não devem ser usados em histórico.

PUT/DELETE bloqueiam o plano e verificam a versão, devolvendo 409 em conflito. Exercícios
são bloqueados por ordem de UUID e atualizados no identity map antes de validar, cobrindo
arquivo/edição concorrentes. Uma gravação inválida não altera o nome nem elimina séries.

## Regras

- Nome não vazio, até 120 caracteres; até 40 exercícios e 1–20 séries por exercício.
- Descanso inteiro 0–3600 segundos; reps inteiras 1–999 e máximo >= mínimo.
- Carga opcional não negativa, até 99999.999 kg e três casas decimais; guardada em
  `numeric(8,3)` e devolvida como string. O editor aceita vírgula decimal portuguesa.
- RIR opcional inteiro 0–10; zero é diferente de não preenchido.
- Carga corporal sem carga adicional (`load_convention=none`) só aceita peso vazio/zero.
  A convenção aparece em cada bloco; a UI de M4 apresenta sempre kg.
- Apagar o plano mantém filhos e exercícios na BD. O plano arquivado deixa de estar
  disponível nas rotas normais. Não existe restauro nesta milestone.
- Um exercício arquivado continua visível nos planos existentes, com aviso. É possível
  mantê-lo/removê-lo ou duplicar um plano que já o contenha; não se podem acrescentar
  novas ocorrências arquivadas através de POST/PUT.

## Ficheiros principais

- `backend/app/modules/templates/{models,schemas,service,router}.py`
- `backend/migrations/versions/0003_templates_workout_templates.py`
- `backend/tests/test_templates.py`
- `mobile/src/features/templates/`: cliente tipado, rascunho/validação, seletor e editor de séries.
- `mobile/src/screens/Template{List,Detail,Editor}Screen.tsx`
- `mobile/src/navigation/WorkoutNavigator.tsx`
- `mobile/tests/templates.test.ts`
- `docs/openapi.json` e `mobile/src/services/api/schema.d.ts`

## Verificação

- 42 testes backend aprovados (16 de planos), em schema PostgreSQL isolado.
- 23 testes mobile aprovados (11 de edição/prescrição, mais sessão e biblioteca).
- Ruff, TypeScript e Alembic check aprovados; migração aplicada à BD local.
- Exportação Android/iOS executada. Não equivale a validar interação num dispositivo.

Os testes novos cobrem ida/volta de decimais, ordem, exercícios repetidos, independência
da cópia, arquivo, isolamento em todas as rotas, referências privadas, paginação,
inputs inválidos, limites, rollback, conflito sequencial e dois editores concorrentes.
No mobile cobrem transformação/validação do rascunho, vírgulas, zero/null, preservação
de tipos de série, referências arquivadas e independência de blocos repetidos.

Os avisos de depreciação Starlette/httpx/AnyIO já existiam. Não foram acrescentadas
dependências nem alterados os lockfiles.

Para atualizar uma instalação existente, na raiz:

```powershell
backend/.venv/Scripts/python -m alembic -c backend/alembic.ini upgrade head
```

Reiniciar a API se não estiver com `--reload`, e recarregar a app no Expo Go.

Teste manual recomendado:

1. Workout → Criar plano → “Push A”. Adicionar dois exercícios, configurar séries,
   carga com vírgula, RIR zero e descanso. Reordenar e guardar.
2. Reabrir e comparar. Editar nome, remover uma série, acrescentar aquecimento e guardar.
3. Duplicar, editar a cópia e confirmar original intacto. Apagar a cópia.
4. Voltar atrás após editar e escolher continuar/descartar. Desligar a rede ao guardar:
   o editor apresenta erro e mantém os campos enquanto a app estiver aberta.
5. Abrir o mesmo plano em dois dispositivos, guardar primeiro num deles e confirmar
   que o segundo recebe conflito. Reabrir para carregar a versão atual.
6. Usar outra conta e confirmar ausência dos planos. Arquivar um exercício pessoal
   utilizado e verificar o aviso no plano.
7. Verificar teclado, scroll, fonte aumentada, retorno Android/gesto iOS e modais de seleção.

## Limites e próximo passo

Ainda falta validar visualmente e interagir em Android/iOS reais. Rascunhos de planos
ficam em memória; encerrar a app antes de guardar perde as alterações. A lista usa offset,
sem snapshot: alterações concorrentes à coleção podem mudar as páginas; atualizar recarrega.
POST de criação/duplicação não possui chave de idempotência: se a resposta se perder após
commit, verificar a lista antes de repetir. Exercícios são referências vivas; renomear ou
mudar a convenção na biblioteca reflete-se no plano, podendo exigir ajustar cargas na edição.

M5 implementa iniciar treino a partir de snapshot do plano, registar resultados reais,
descanso, pausa/cancelamento e persistência/recuperação da sessão. A finalização, histórico
e métricas ficam para M6. Não foram implementados treinos ativos, progresso ou AI em M4.
