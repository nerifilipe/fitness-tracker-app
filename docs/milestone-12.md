# M12 — API online e APK Android

## Estado real da entrega

A preparação no repositório e a verificação local estão feitas. **A API ainda não
está online e não há APK instalável gerado.** É necessário criar/ligar as contas
Neon, Render e Expo, publicar o código e obter o URL definitivo antes do build.
`expo whoami` indicou que não existe sessão Expo iniciada neste PC.

O utilizador escolheu custo zero. A configuração não cria serviços pagos nem uma
base Render. A utilização fica sujeita às quotas dos planos gratuitos; não ativar
upgrades ou faturação adicional para continuar esta entrega.

## Serviços escolhidos

| Serviço | Função | Plano |
|---|---|---|
| [Neon](https://neon.com/pricing) | PostgreSQL persistente | Free |
| [Render](https://render.com/docs/free) | API FastAPI em Docker, HTTPS | Free |
| [Expo EAS](https://docs.expo.dev/build-reference/apk/) | Compilar e assinar APK | Quota gratuita da conta |

O Render Free adormece após 15 minutos sem pedidos e pode levar cerca de um minuto
a acordar. A base PostgreSQL gratuita do próprio Render expira após 30 dias; por
isso, esta configuração usa Neon Free, cujo plano não tem prazo fixo. O Neon tem
limites de armazenamento e computação: consultar a página do plano ao criar a conta.

O APK espera até 90 segundos por pedido, permitindo o arranque do serviço gratuito.
Não repete escritas automaticamente. Em desenvolvimento, o limite continua em 10
segundos. Não há automação a fazer pedidos para evitar a suspensão dos serviços.

## 1. Criar a base no Neon

1. Criar conta e projeto no plano **Free**. Escolher PostgreSQL 17 e uma região
   europeia próxima de Frankfurt, se disponível.
2. Em **Connect**, obter a connection string PostgreSQL **direta**, sem pooling,
   com os parâmetros TLS fornecidos pelo Neon (`sslmode=require`, etc.).
3. Colar esse valor apenas na variável privada `DATABASE_URL` do Render, no passo
   seguinte. Não o adicionar ao código, ao mobile ou às mensagens do chat.

A API aceita os prefixos `postgresql://`, `postgres://` e `postgresql+psycopg://`,
convertendo-os para o driver psycopg 3 e preservando password e parâmetros TLS.

## 2. Publicar a API no Render

1. Fazer commit/push desta entrega para o repositório GitHub.
2. Criar conta Render. Escolher **New → Blueprint** e ligar o repositório
   `nerifilipe/fitness-tracker-app` com o `render.yaml` da raiz.
3. Confirmar o serviço **Free** e fornecer a variável `DATABASE_URL` do Neon.
   O Blueprint gera `JWT_SECRET` automaticamente; conservar esse valor entre deploys.
4. Criar o serviço e aguardar o primeiro deploy. O arranque executa migrações e
   insere o catálogo, preservando dados existentes. Se falhar, a API não começa a
   aceitar pedidos sobre uma base incompleta.
5. Copiar o domínio HTTPS atribuído pelo Render. O endereço utilizado pelo mobile
   será `https://TEU-SERVICO.onrender.com/api/v1` — substituir pelo domínio real.

As atualizações automáticas estão desligadas para controlar os deploys e a quota
de builds. Após alterações no backend, publicar o commit e usar **Manual Deploy**.

Verificar a API a partir da raiz do projeto, substituindo o endereço de exemplo:

```powershell
backend/.venv/Scripts/python backend/scripts/check_deployment.py --api-url https://TEU-SERVICO.onrender.com/api/v1
```

O script só lê: exige 200 em `/health` e `/ready`, e 401 em `/workouts/active` sem
credenciais. O health check periódico do Render usa `/health`, que não consulta a
base e não mantém o Neon acordado artificialmente.

## 3. Ligar o Expo e gerar o APK

Criar uma conta Expo gratuita e executar no terminal, introduzindo a password apenas
no pedido de login do CLI:

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

O `init` liga/cria o projeto Expo e atribui um UUID público. Como há configuração
dinâmica, o CLI pode pedir que esse UUID seja adicionado manualmente. Nesse caso,
adicionar em `mobile/app.json`, dentro de `expo`, preservando os restantes campos:

```json
"extra": { "eas": { "projectId": "UUID-REAL-DO-PROJETO" } }
```

`app.config.js` devolve essa configuração. Não inventar o UUID nem usar o exemplo.
Depois de o projeto estar ligado, configurar o endereço HTTPS real no ambiente
**preview** do EAS:

```powershell
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://TEU-SERVICO.onrender.com/api/v1 --environment preview --visibility plaintext
npx eas-cli@latest build --platform android --profile preview
```

O URL da API é público e fica incorporado no APK. Credenciais PostgreSQL e JWT_SECRET
ficam exclusivamente no backend. O build rejeita HTTP, localhost, IPs privados,
endereços de exemplo e URLs com credenciais ou caminhos diferentes de `/api/v1`.
O ambiente local de Expo Go continua a aceitar a API de desenvolvimento.

O perfil `preview` gera um **APK de distribuição interna com JavaScript incluído**:
funciona sem Metro, sem Expo Go e sem o PC. O CLI pode pedir autorização para gerar
a chave de assinatura Android; conservar essa chave na conta Expo para permitir
atualizações do mesmo aplicativo. O identificador é `com.nerifilipe.fitnesstracker`.
O número Android é incrementado pelo EAS. Não substituir a chave entre versões.

Quando o build terminar, abrir no telemóvel o link do APK apresentado pelo Expo e
instalar. O perfil `production` está preparado para AAB, mas publicar na Play Store
não faz parte desta entrega. Mudar o URL da API exige novo build do APK.

Se a quota gratuita de builds não estiver disponível, aguardar a renovação; não
ativar um plano pago para contornar o limite.

## Dados e validação no telemóvel

A base Neon nova começa vazia, com o catálogo inicial. As contas e os registos da
base de desenvolvimento não são transferidos automaticamente. Permanecem no PC;
uma eventual migração dos dados pessoais deve ser tratada antes de abandonar esse
ambiente. A instalação própria também tem armazenamento separado do Expo Go.

Depois da instalação, desligar o USB e testar por Wi-Fi ou dados móveis com o PC
desligado: registo/login, iniciar e concluir um treino, nutrição, medidas, gráficos
e sugestões. Para testar offline, iniciar um treino com ligação, ativar modo avião,
registar séries, reabrir a app e finalmente voltar a ligar para sincronizar.

Esta validação nativa continua pendente. A exportação JavaScript Android não equivale
a compilar, instalar ou testar um APK no dispositivo.

## Implementação e verificações locais

- `backend/Dockerfile`: Python 3.12, dependências fixadas e execução como utilizador
  não-root. `.env` e outros dados locais ficam fora do contexto de build.
- `start_service.py`: exige DATABASE_URL/JWT_SECRET externos, migrações e seed na
  mesma transação com advisory lock, antes de iniciar um único worker Uvicorn.
  Erros de arranque não imprimem URLs ou credenciais. O limitador de autenticação
  existente é por processo, compatível com esta configuração de uma instância.
- `render.yaml`: Free, região Frankfurt, CORS vazio para o cliente nativo e cabeçalhos
  de proxy confiados no ambiente protegido pelo proxy Render. Para outro alojamento,
  rever `FORWARDED_ALLOW_IPS`; não copiar `*` para uma porta diretamente exposta.
- `eas.json`, `app.config.js` e `scripts/check-release.cjs`: perfis e validação do
  URL. `.easignore` exclui backend, documentação, caches e credenciais do upload.
- `compose.release-test.yaml`: base de teste isolada e API em `127.0.0.1:18000`.
  Não usa a base ou volume de desenvolvimento.

Passaram 10 testes backend (configuração/health), 45 mobile (release, sessão e treino),
TypeScript e Ruff. A exportação Android pelo Expo também terminou com sucesso.

A imagem Docker foi construída e arrancou uma base PostgreSQL vazia. Confirmados
health/readiness, bloqueio sem autenticação, registo e 24 exercícios únicos. Depois
de recriar apenas a API, a conta continuou a autenticar e o catálogo manteve 24
exercícios sem duplicação. Nenhum serviço externo foi criado nem nenhum APK enviado.

Reproduzir o teste local, a partir da raiz:

```powershell
docker compose -f compose.release-test.yaml -p fitness-release-test up -d --build --wait
backend/.venv/Scripts/python backend/scripts/check_deployment.py --api-url http://127.0.0.1:18000/api/v1
docker compose -f compose.release-test.yaml -p fitness-release-test stop
```

Commit sugerido: `feat(deploy): prepare free hosting and Android APK builds`

Referências: [Render Free](https://render.com/docs/free),
[Render Blueprint](https://render.com/docs/blueprint-spec),
[Neon Free](https://neon.com/pricing),
[Expo APK](https://docs.expo.dev/build-reference/apk/),
[variáveis EAS](https://docs.expo.dev/eas/environment-variables/).
