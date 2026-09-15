# M12 — API online e APK Android

## Estado real da entrega

**API publicada e APK compilado e verificado em 15/09/2026.** O utilizador
confirmou posteriormente a instalação e o funcionamento no Android. As três contas foram ligadas pelos fluxos
oficiais de autenticação no navegador, usando os CLIs.

- API: `https://fitness-tracker-api-ku46.onrender.com/api/v1`
- [Serviço Render](https://dashboard.render.com/web/srv-dakrvv2fngtc73e1vbbg):
  plano `free`, Frankfurt, deploy `dep-dakrvvifngtc73e1ve40`, commit `317672a`.
- Neon: projeto `hidden-mountain-77878161` (`fitness-tracker`), PostgreSQL 17,
  Frankfurt, organização Free. Endpoint de 0,25 CU; suspensão usa o padrão do plano.
- [Projeto Expo](https://expo.dev/accounts/nerifilipe/projects/fitness-tracker):
  `f3810486-5c04-4145-a7ad-227849c49f21`, conta `nerifilipe`.
- [Build Android](https://expo.dev/accounts/nerifilipe/projects/fitness-tracker/builds/07348244-3818-4517-89be-3985a2fa6a7b):
  concluído, perfil `preview`, versão 0.1.0, versionCode 2, assinatura gerida pelo Expo.
- [Descarregar APK](https://expo.dev/artifacts/eas/mPO6dddmeKd-IrB6CpaMe0ebkzlz3hpnfxSqXFXz7OM.apk):
  abrir no Android e instalar; não precisa de Expo Go nem do PC.

Foi guardada uma cópia local em `.cache/deploy-tools/fitness-tracker-0.1.0-2.apk`
(fora do Git), com 85 344 535 bytes. SHA-256:
`14c2dc916089de3215db3e30efcc7d781426cd546f16ad8a4d1a57c1f88b9077`.
A inspeção do APK confirmou manifesto, executável Android, bibliotecas ARM64 e
JavaScript incluído com o endereço real da API. Esta verificação não substitui
o teste no dispositivo.

Os serviços já existem: usar os links acima para gerir esta instalação. As secções
de criação abaixo servem de referência para reproduzir a configuração noutro ambiente.

## Atualizar esta instalação

- **Documentação:** fazer commit/push das alterações; não requer deploy nem novo APK.
- **Backend:** depois de publicar o commit no GitHub, usar **Manual Deploy** no
  serviço Render existente. Confirmar `/health`, `/ready` e bloqueio sem autenticação
  com `backend/scripts/check_deployment.py`. As migrações são aplicadas no arranque.
- **App:** em `mobile`, executar `npx eas-cli@latest build --platform android --profile preview`
  na conta já ligada. O ambiente `preview` já contém o URL da API online; o EAS
  incrementa o versionCode. Instalar o novo APK com a mesma assinatura e identificador.
- **Registo da entrega:** atualizar o link do APK no README e nesta página, versão,
  versionCode e verificações efetivamente realizadas. Conservar uma cópia do artefacto
  fora do Git; o link do build fica como referência da compilação.

Preservar a base Neon, o `JWT_SECRET` no Render e a chave Android no Expo entre
atualizações. Os ficheiros `.env`, credenciais e binários APK/AAB estão excluídos do Git.

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

O utilizador confirmou a instalação e o funcionamento do APK no Android. Não foi
registada uma execução individual de cada cenário abaixo; permanecem como guia
para uma validação mais completa.

O README em inglês inclui as [capturas atuais fornecidas pelo utilizador](screenshots/android/release-0.1.0/README.md)
do início, planos, biblioteca, nutrição e progresso. As imagens mostram o estado
inicial da conta; não constituem evidência de todos os fluxos de escrita e sincronização.

Desligar o USB e testar por Wi-Fi ou dados móveis com o PC
desligado: registo/login, iniciar e concluir um treino, nutrição, medidas, gráficos
e sugestões. Para testar offline, iniciar um treino com ligação, ativar modo avião,
registar séries, reabrir a app e finalmente voltar a ligar para sincronizar.

O teste de utilização comunicado pelo utilizador complementa a compilação e a
inspeção local do APK. Não equivale a uma validação exaustiva de todos os ecrãs,
acessibilidade, perda de rede ou funcionamento em iOS.

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
exercícios sem duplicação.

Na publicação real, passaram `/health` e `/ready` (200) e `/workouts/active` sem
credenciais (401). Uma consulta só de leitura confirmou a migração `0006_progress`
e 24 exercícios no Neon. A API foi criada pelo CLI/API Render com os campos do
Blueprint validado; não foi criada uma ligação automática ao Blueprint. Alterações
em `render.yaml` não modificam automaticamente este serviço. Os outros projetos
existentes nas contas foram preservados.

Reproduzir o teste local, a partir da raiz:

```powershell
docker compose -f compose.release-test.yaml -p fitness-release-test up -d --build --wait
backend/.venv/Scripts/python backend/scripts/check_deployment.py --api-url http://127.0.0.1:18000/api/v1
docker compose -f compose.release-test.yaml -p fitness-release-test stop
```

Referências: [Render Free](https://render.com/docs/free),
[Render Blueprint](https://render.com/docs/blueprint-spec),
[Neon Free](https://neon.com/pricing),
[Expo APK](https://docs.expo.dev/build-reference/apk/),
[variáveis EAS](https://docs.expo.dev/eas/environment-variables/).
