# Jarvis

Assistente pessoal de IA que roda conectado a um número de WhatsApp dedicado, como se fosse um contato normal. Você conversa com ele pelo WhatsApp; ele usa a API da Anthropic (Claude) para entender pedidos e executar ações através de ferramentas.

Fase atual: **base** — conexão com WhatsApp, agenda e lembretes. As demais áreas (financeiro, redes sociais, saúde, administração da Prisma, extras) ainda não existem e serão adicionadas por cima dessa base.

## Como funciona

- O Jarvis roda como um processo Node.js de longa duração, conectado via [Baileys](https://github.com/WhiskeySockets/Baileys) a um número de WhatsApp dedicado a ele (o "celular sempre ligado").
- Só o **Dono** (o número configurado em `OWNER_WHATSAPP_NUMBER`) pode dar comandos. Mensagens de outros números são ignoradas.
- O cérebro conversacional usa a API da Anthropic com *tool use*: o modelo decide quando criar lembretes, consultar a agenda ou propor uma mensagem a terceiros, chamando ferramentas em vez de apenas responder texto.
- Ações sensíveis (hoje: enviar mensagem a terceiros em nome do Dono) nunca são executadas direto — o Jarvis cria uma **ação pendente**, mostra o rascunho, e só executa depois de uma confirmação explícita do Dono ("sim"/"não").
- Estado (lembretes, compromissos, ações pendentes, sessão do WhatsApp) fica salvo localmente em `./data/` — não há servidor nem banco externo nesta fase.

## Setup

Pré-requisitos: Node.js 20+ e um número de WhatsApp dedicado ao Jarvis (pode ser um chip separado no celular que vai ficar sempre ligado).

```bash
npm install
cp .env.example .env
```

Edite o `.env`:

- `OWNER_WHATSAPP_NUMBER`: seu número de WhatsApp (o Dono), com DDI e DDD, só dígitos. Ex: `5511999999999`.
- `ANTHROPIC_API_KEY`: sua chave da API da Anthropic (ou deixe em branco se já autenticou localmente com `ant auth login`).
- Demais variáveis (`TIMEZONE`, `MORNING_BRIEFING_TIME`, etc.) já vêm com valores padrão razoáveis.

Rodar em desenvolvimento (recarrega ao editar código):

```bash
npm run dev
```

Na primeira execução, um QR code aparece no terminal. Escaneie com o **WhatsApp do número dedicado ao Jarvis** (Configurações → Aparelhos conectados → Conectar um aparelho) — não com o seu próprio número. A sessão fica salva em `./data/wa-auth/`, então isso só é necessário uma vez.

Depois de conectado, mande uma mensagem do seu número (o Dono) para o número do Jarvis. Ele responde por ali.

Build de produção:

```bash
npm run build
npm start
```

## Atualizar depois de uma mudança no código (Windows)

Depois que o Jarvis já estiver rodando 24h via PM2 (veja o passo a passo que te passei), toda vez que houver uma atualização de código é só dar duplo clique em `atualizar-jarvis.bat`, na raiz do projeto. Ele faz `git pull` + `npm install` + `npm run build` + reinicia o processo `Javys` no PM2 (ou cria o processo, se for a primeira vez), tudo em sequência, e para com uma mensagem clara se algum passo falhar.

## O que já dá pra fazer

- Conversar com o Jarvis pelo WhatsApp (só o Dono).
- Criar, listar e cancelar lembretes ("me lembre de ligar pro dentista às 15h").
- Criar, listar e cancelar compromissos na agenda.
- Receber lembretes automaticamente quando vencem.
- Receber um briefing matinal diário com os compromissos do dia (horário configurável).
- Pedir para o Jarvis mandar uma mensagem a alguém em seu nome — ele rascunha, mostra pra você, e só envia depois do seu "sim".

## Roadmap (próximas fases)

A base foi desenhada para crescer por módulos, sem precisar reescrever o núcleo (conexão com WhatsApp, motor de conversa, fila de confirmação). Áreas planejadas, na ordem do briefing original:

1. **Financeiro** — Open Finance (extrato, Pix, cartão), categorização automática de gastos, alertas de gasto acima do normal, metas por categoria, projeção mensal, freio para compra por impulso, comparação de preços antes de assinar serviços.
2. **Redes sociais** — Instagram, Facebook e TikTok (postagem com legenda sugerida e agendamento), acompanhamento do TikTok Shop.
3. **Saúde e hábitos** — personal trainer (cargas, repetições, grupo muscular do dia), lembrete e contagem de água, rastreamento de hábitos e sequências (streaks).
4. **Administração da plataforma Prisma** — acesso ao painel administrativo, avisos de novos alunos, criação de vouchers, tarefas administrativas sob comando.
5. **Extras** — diário de bordo de decisões importantes, escuta ativa (retomar assuntos desabafados), simulação de conversas difíceis, resumo de livros/conteúdos, lembrete de detalhes de pessoas (networking), checklist de reflexão diária, alerta de assinaturas/contratos vencendo, curadoria de notícias, treinador de estudo.

Cada área nova deve seguir o mesmo padrão já estabelecido: um módulo próprio em `src/modules/`, ferramentas registradas em `src/core/tools.ts`, e qualquer ação sensível (gastar dinheiro, postar publicamente, etc.) passando pela fila de confirmação em `src/core/confirmations.ts` antes de executar.

## Estrutura do projeto

```
src/
  config/       variáveis de ambiente
  core/         cérebro do Jarvis: prompt de sistema, ferramentas, loop de conversa, fila de confirmação
  modules/
    agenda/     lembretes, compromissos, scheduler (checagem de vencidos + briefing matinal)
  storage/      persistência local (lowdb/JSON)
  utils/        logger, utilitários de data/hora com fuso horário
  whatsapp/     conexão com o WhatsApp (Baileys)
```

## Notas de segurança

- O `.env` e a pasta `data/` (sessão do WhatsApp, lembretes, etc.) nunca devem ser commitados — já estão no `.gitignore`.
- Se a sessão do WhatsApp for deslogada (ex: removida manualmente no celular), apague `data/wa-auth/` e rode de novo para gerar um novo QR code.
