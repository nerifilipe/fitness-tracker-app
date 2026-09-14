# M5 — Treino ativo e recuperação local

## Entrega

O detalhe de um plano permite iniciar um treino. A Home e a lista Workout mostram
um acesso para retomar a sessão. O treino abre num ecrã próprio, fora das tabs, e
voltar atrás não elimina dados.

Inclui registo de carga, repetições, RIR e tipo de série, conclusão com um toque,
correção através de desmarcar a série, adicionar/remover séries e exercícios,
substituir exercícios, notas, pausa/retoma e cancelamento confirmado. Remover ou
substituir um exercício pede confirmação antes de eliminar os seus resultados.

Os valores iniciais vêm do plano, sem marcar séries como realizadas. Cada conclusão
inicia o descanso configurado; é possível acrescentar 30 segundos ou saltar o descanso.
O tempo ativo desconta as pausas. O descanso usa um deadline absoluto e continua durante
uma pausa do treino, mesmo em segundo plano. Ao regressar, o contador é recalculado
pelo relógio; não existem notificações/som em background nesta etapa.

**Ainda não existe finalização de treino como concluído.** M5 permite registar, pausar,
retomar e cancelar. A finalização, histórico, volume e PRs pertencem a M6. Não cancelar
um treino que se pretende manter em curso: pausar e voltar atrás preserva-o.

## API e base de dados

Migração `0004_workouts`, depois de `0003_templates`, acrescenta `workouts`,
`workout_exercises`, `workout_sets` e `workout_mutations`. Não remove dados existentes.
O treino guarda snapshot do nome do plano, dos nomes dos exercícios e das convenções de
carga. Alterar o catálogo/plano posteriormente não reescreve o treino em curso.

| Método | Endpoint | Comportamento |
|---|---|---|
| POST | `/api/v1/workouts` | UUID de treino gerado no dispositivo + template_id/template_version; snapshot do plano |
| GET | `/api/v1/workouts/active` | Treino ativo/pausado da conta, ou null |
| GET | `/api/v1/workouts/{id}` | Detalhe com snapshot, incluindo registo cancelado |
| PUT | `/api/v1/workouts/{id}` | Agregado de resultados, estado, versão e mutation_id |

Todos exigem autenticação e autorização por proprietário. Recursos alheios devolvem
404; referências inválidas a exercícios são rejeitadas. `Cache-Control: no-store` cobre
as respostas. A API não aceita nomes/convenções enviados pelo cliente como snapshots.
Novos exercícios recebem metadados do catálogo; entradas mantidas conservam os snapshots.

A criação bloqueia a linha do utilizador e existe um índice único parcial para
`status IN ('active','paused')`: só pode existir um treino em curso por conta.
Repetir o mesmo UUID e conteúdo de criação devolve o mesmo treino, sem o recriar,
mesmo que entretanto tenha sido cancelado. O plano tem de estar acessível, não vazio,
e na versão lida. Planos existentes podem iniciar com referências já arquivadas;
novas adições/substituições exigem exercícios atualmente disponíveis.

PUT bloqueia o treino, verifica `version`, valida e grava numa transação. O array define
a ordem; IDs de exercícios/séries são preservados, embora as linhas dos filhos sejam
substituídas na transação. São rejeitados IDs repetidos ou pertencentes a outros treinos.
Os recibos `workout_mutations` guardam hash e versão aplicada por UUID de pedido.
Repetir o pedido exato não aplica novamente; reutilizar a chave com conteúdo diferente
devolve 409. A resposta inclui o treino atual e `applied_version`, para o cliente detetar
alterações posteriores num replay. Não se guardam cópias integrais de cada resposta na BD.

Limites: até 50 exercícios, 1–30 séries por exercício, descanso 0–3600 s, reps 1–999,
RIR opcional 0–10 e carga `numeric(8,3)` opcional enquanto a série não estiver concluída.
Concluir exige reps e peso (0 quando não existe carga adicional). Carga `none` aceita
apenas vazio/zero. Timestamps têm timezone; séries não podem anteceder o treino nem
ultrapassar a pausa/cancelamento. Para séries ativas tolera-se até cinco minutos de
diferença em relação ao relógio do servidor. Durações negativas/incoerentes são rejeitadas.

## Persistência no telemóvel

`fitness-workouts.db` usa WAL e `synchronous=FULL`. Guarda um agregado JSON versionado
em `active_workout_v1`, indexado pelo ID do utilizador. Cada edição é escrita de forma
síncrona antes de publicar o novo valor na UI; se a escrita falha, o campo mantém o
último valor persistido e mostra erro. Não se anuncia uma alteração como guardada se
SQLite a rejeitar. Texto numérico incompleto também fica localmente guardado e é
validado antes do envio. O volume está limitado ao agregado de um treino; o desempenho
no limite máximo ainda precisa de medição num telemóvel.

A sincronização tem debounce de 800 ms, um pedido de cada vez, e pode ser acionada pelo
botão Sincronizar agora, ao recuperar a sessão e ao voltar ao foreground. Não há serviço
de sincronização em background nem detetor contínuo de rede. Depois de uma falha,
registar nova alteração ou tocar em Sincronizar agora tenta de novo.

Antes de enviar, persistem-se a versão, mutation_id, corpo exato e revisão local incluída.
Perder a resposta ou fechar a app permite reenviar o mesmo pedido. Alterações feitas
durante o envio continuam no SQLite; o ACK apenas confirma a revisão que foi enviada,
sem substituir a edição mais recente. Falhar a gravação do ACK também preserva o pedido
para replay. A intenção de iniciar treino é persistida antes do POST.

409 interrompe a sincronização automática e mantém o registo local. A UI permite
exportá-lo e carregar explicitamente a versão do servidor, guardando antes uma cópia em
`workout_recovery_v1`. Essa cópia pode ser exportada mais tarde no mesmo dispositivo/conta.
Não existe merge automático nem aplicação forçada por cima de alterações de outro aparelho.
Dados com formato local desconhecido não são apagados silenciosamente.

O controller pertence à conta. Ao sair/mudar de conta é descartado; respostas tardias
não escrevem na sessão seguinte. Os rascunhos das outras contas ficam separados, e
logout não apaga os seus registos pendentes. Desinstalar a app ou limpar os seus dados
continua a poder remover registos que ainda não chegaram ao servidor.

## Recuperação offline da identidade

SecureStore passa a guardar token de refresh e perfil em cache no mesmo envelope
versionado, com uma única escrita. Access tokens continuam apenas em memória.
O formato anterior (apenas refresh) é lido e atualizado na próxima autenticação/rotação
bem-sucedida. Após falha de rede/servidor na recuperação, a identidade previamente
guardada permite abrir o treino local. Um 401 revoga essa recuperação e exige login.
A primeira chamada à API depois de recuperar offline tenta obter um access token válido;
a cache nunca autoriza recursos no servidor. Uma falha de SecureStore não ativa o fallback.

O primeiro login, a obtenção do snapshot inicial e a consulta da biblioteca para novas
adições/substituições requerem rede. Editar séries, notas, descanso e estado de um treino
já carregado funciona sem rede, incluindo após reiniciar a app.

## Ficheiros principais

- `backend/app/modules/workouts/{models,schemas,service,router}.py`
- `backend/migrations/versions/0004_workouts_active_workouts.py`
- `backend/tests/test_workouts.py`
- `mobile/src/features/workouts/{controller,draft,storage,api}.ts`
- `mobile/src/features/workouts/{WorkoutProvider,WorkoutBanner,LiveExerciseCard}.tsx`
- `mobile/src/screens/ActiveWorkoutScreen.tsx` e acesso no detalhe do plano
- `mobile/src/features/auth/{session,credentials}.ts` e `AuthProvider.tsx`
- `mobile/tests/{workouts,workout-storage,session}.test.ts`
- `docs/openapi.json` e `mobile/src/services/api/schema.d.ts`

## Verificações e limites

- 55 testes backend aprovados, incluindo 13 de treino ativo, em schema PostgreSQL isolado.
- 45 testes mobile aprovados: 17 de lógica/sincronização de treino, 1 com SQLite real,
  12 de autenticação e os 15 anteriores de biblioteca/planos.
- TypeScript, Ruff e Alembic check aprovados; migração aplicada à BD local.
- Bundles Android e iOS gerados com SQLite/Crypto incluídos.
- SQLite foi testado através do motor real `node:sqlite`, incluindo reabrir a conexão,
  isolamento por conta, PRAGMA de durabilidade e preservação de cópias/formato desconhecido.
  Este teste não substitui testar o módulo nativo Expo no dispositivo.

Testes cobrem snapshots, isolamento, referências, replay de criação/atualização após
cancelamento ou revisão posterior, um único treino em starts concorrentes, séries
inválidas, pausa/retoma/cancelamento, recuperação sem rede, rejeição de credenciais
revogadas, respostas tardias, coalescing, edição durante envio, erros de disco, ACK perdido,
conflitos e temporizadores baseados em timestamps.

Ainda falta validação visual/interativa em Android/iOS e ensaiar force-close no Expo Go.
Mantêm-se os avisos de depreciação Starlette/httpx/AnyIO. A instalação das dependências
indicou os mesmos 17 avisos moderados npm já existentes. Dependências novas: expo-sqlite
e expo-crypto compatíveis com SDK 57; @types/node apenas para os testes. Não se alteraram
versões de Expo/React Native nem se acrescentaram dependências backend.

## Testar no Expo Go

Nesta workspace a migração e as dependências já foram aplicadas. Noutra instalação:

```powershell
backend/.venv/Scripts/python -m alembic -c backend/alembic.ini upgrade head
cd mobile
npm ci
npx expo start --go --lan
```

Reinicia também a API se não usar `--reload`. Mantém `EXPO_PUBLIC_API_URL` a apontar
para o IPv4 do PC. Para a primeira recuperação offline, abre a app uma vez com rede
para atualizar as credenciais antigas.

1. Abre um plano com exercícios → Iniciar treino. Confirma nome, ordem e valores iniciais.
2. Altera peso/reps, conclui uma série e verifica descanso; desmarca e corrige.
3. Pausa, espera e retoma. Coloca a app em segundo plano e verifica os contadores ao voltar.
4. Desliga a rede, regista séries/notas, fecha completamente o Expo Go e reabre.
   Retoma pela Home e confirma os valores; liga a rede e sincroniza.
5. Adiciona/substitui um exercício com rede; remove uma série e verifica a recuperação.
6. Abre o treino noutro aparelho, altera e sincroniza. No primeiro, provoca conflito,
   exporta a cópia local e carrega a versão do servidor.
7. Cancela um treino de teste, sincroniza e inicia outro. Verifica que não aparece
   como concluído. Um cancelamento rejeitado permite voltar à edição para corrigir.
8. Testa outra conta: não deve ver o treino nem as cópias de recuperação da primeira.

Próximo passo: M6, com finalização idempotente, histórico, detalhe de sessões concluídas,
volume, PRs básicos e dashboard semanal baseado nos dados reais.
