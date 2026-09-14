# M7 — Validação da V1

## Estado

Validação automatizada concluída nesta passagem. **M7 ainda não está fechado**:
faltam testes visuais, navegação por toque e tecnologias de apoio em dispositivos.
Não foram produzidas screenshots de portefólio sem executar a interface nativa.

No PC de validação, PostgreSQL 17 estava saudável. Não se encontrou adb no PATH,
SDK/emulador Android no diretório padrão, processo de emulador ativo ou dispositivo
Android/ADB/portátil na enumeração PnP do Windows. Não se substituiu a aplicação por
uma versão web com armazenamento simulado para alegar validação nativa.

## Fluxo integrado executado

`backend/tests/test_mobile_integration.py` cria uma API FastAPI/Uvicorn real em
127.0.0.1 e porta livre, usando o schema PostgreSQL isolado e migrado da suite.
Executa `mobile/tests/integration/journey.test.ts` por Vitest. O servidor e o schema
são encerrados/removidos no fim, inclusive em falha; os dados pessoais ficam intactos.

O cenário usa AuthSession, o transporte HTTP real, os clientes da API, WorkoutController,
as funções de edição e o adaptador de armazenamento usados pela aplicação. Usa uma
base SQLite em ficheiro temporário, fecha a ligação e abre outra para verificar a
recuperação. Apenas a ligação expo-sqlite é adaptada para node:sqlite; as credenciais
usam um armazenamento de teste em memória. Isto não valida SecureStore/SQLite nativos,
Hermes em execução, componentes React Native ou o ciclo de vida real do sistema móvel.

Sequência verificada:

1. Registar conta, atualizar Perfil, consultar exercícios, criar e reler um plano.
2. Iniciar treino e alterar o plano, preservando o snapshot da sessão iniciada.
3. Interromper o transporte, concluir séries de trabalho/aquecimento, deixar uma
   incompleta, pausar e finalizar sem rede.
4. Descartar o controller, fechar SQLite, reabrir a ligação e recuperar identidade e
   conclusão pendente sem rede.
5. Restabelecer transporte e perder deliberadamente a resposta **depois** de a API
   gravar a conclusão. Reenviar o mesmo corpo e confirmar uma única sessão no histórico.
6. Confirmar snapshot, 2 séries concluídas, 1 não realizada, volume exato de 161 kg·reps,
   marcas iniciais, objetivo atualizado e ausência de treino ativo.
7. Iniciar/cancelar outra sessão, sem aumentar o histórico nem o total semanal.
8. Terminar sessão, registar outra conta e confirmar isolamento do SQLite/histórico;
   tentar abrir o resumo da primeira conta devolve 404.

A falha de rede é injetada no transporte; a perda de resposta é injetada após uma
resposta HTTP real de sucesso. Não se desliga fisicamente a rede nem se mata o Expo Go.
Casos de concorrência, versões em conflito e recuperação de pedidos em curso continuam
cobertos pelos testes de M5/M6.

## Problema reproduzido e corrigido

Alterar o objetivo de 4 para 2 treinos atualizava o servidor e a interface em memória,
mas não o envelope de credenciais usado para recuperar o Perfil sem rede. O novo
cenário integrado falhou inicialmente com `expected 4 to be 2` após reabertura offline.

`AuthSession.updateProfile` agora atualiza também a cópia local. Escritas do Perfil,
renovação de credenciais e limpeza da sessão usam uma fila, evitando que uma escrita
antiga substitua o refresh token renovado. Uma falha ao guardar a cópia local informa
que o servidor já guardou as preferências e permite tentar novamente.

Foram adicionados três testes: recuperar o Perfil atualizado sem rede, falha/retry da
cópia local e concorrência entre gravação do Perfil, rotação e logout. O cenário
integrado passou depois da correção.

## Revisão da interface

- Os campos e botões de conclusão identificam exercício e número da série nas
  etiquetas de acessibilidade. Input/Button aceitam uma etiqueta específica, mantendo
  o texto visual conciso.
- O histórico usa KeyboardAvoidingView e keyboardShouldPersistTaps="handled", para
  acomodar o teclado e permitir acionar os filtros enquanto um campo está focado.
- Foram revistos os componentes base: alvos de toque mínimos de 48, estados disabled/
  busy nos botões e texto sem desativar a escala de fonte do sistema.

Estas são correções/revisões do código. Legibilidade, sobreposições, foco, toque,
TalkBack/VoiceOver e comportamento do teclado precisam ainda de execução nativa.

## Resultados

- Suite backend: **71 testes passaram**, incluindo o cenário HTTP/mobile/SQLite.
- Suite mobile: **56 testes passaram**, com o cenário de integração saltado quando
  não é iniciado pelo servidor isolado. Esse cenário passou através da suite backend.
- TypeScript e Ruff: passaram.
- Expo install --check: dependências compatíveis, sem alterações de versões.
- Exportação dos bundles Android e iOS: passou.
- Dois avisos existentes de depreciação Starlette/httpx/AnyIO permanecem na suite backend.

Para repetir a integração, com PostgreSQL disponível e dependências instaladas:

```powershell
backend/.venv/Scripts/python -m pytest backend/tests/test_mobile_integration.py -q
```

Não definir FITNESS_INTEGRATION/EXPO_PUBLIC_API_URL manualmente para apontar este teste
à API pessoal: usar o harness Python, que fornece o servidor e schema de teste.

## Pendente para fechar M7

- Executar os novos ecrãs num Android e num iPhone; testar navegação, foco e teclado.
- Testar fonte aumentada e leitores de ecrã, incluindo a identificação de cada série.
- Fechar forçadamente o Expo Go/dispositivo e testar rede física desligada/religada.
- Medir a interação com um treino grande e histórico extenso.
- Capturar screenshots reais e preparar a apresentação do portefólio.

Commit sugerido: `fix: preserve offline profile and add end-to-end workout validation`
