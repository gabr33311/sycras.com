# Sinal contra faltas: desenho

Data: 2026-11-09 · Aprovado pelo dono (Gabriel) em conversa · Site (este repositório) + app (`sycras-mobile`)

## Porquê

Os barbeiros perdem dinheiro com clientes que marcam e não aparecem. Um adiantamento pago ao marcar
(o "sinal") faz o cliente pensar duas vezes antes de faltar e, se faltar, compensa a cadeira vazia.
Quem não sofre com faltas deixa a opção desligada.

## Objetivos

- O barbeiro liga "Pedir sinal ao marcar" e escolhe o valor; daí em diante quem marca na página paga
  o sinal antes de a marcação ficar feita.
- O dinheiro vai direto para a conta Stripe do barbeiro. A SYCRAS não fica com nada.
- Devoluções automáticas quando o cliente cancela a tempo; o barbeiro fica com o sinal quando o
  cliente falta ou cancela tarde.
- O barbeiro vê em cada marcação quanto já foi pago e quanto falta.

## Fora de âmbito

- Lista de espera e cartões-oferta (recusados pelo dono).
- Cobrar o serviço inteiro online. Só o sinal.
- Sinal em marcações feitas pelo próprio barbeiro (app ou site). Nunca pedem sinal.
- Faturação: emitir fatura do sinal é responsabilidade do barbeiro, como hoje no balcão.
- Comissão da SYCRAS sobre o sinal.

## O que seria um fracasso (mesmo que funcione)

- O cliente paga e a marcação não fica feita, ou fica feita sem pagamento confirmado.
- Um horário fica preso por um pagamento abandonado.
- Um cliente que cancelou a tempo não recebe o dinheiro de volta sem o barbeiro ter de fazer nada.
- O barbeiro não percebe, na app, se a pessoa já pagou.
- Linguagem técnica no ecrã ("PaymentIntent", "Connect", "webhook"). Tudo em português simples.

## Como funciona (decidido com o dono)

### Ligar a opção (barbeiro)

- Só para o SYCRAS Pro **pago** (a mesma regra que já decide os lembretes e o bloqueio de clientes:
  `access.pro`). Se o Pro acabar, o sinal deixa de ser pedido.
- Em Gestão → Regras e lembretes → "Pedir sinal ao marcar" (site e app).
- Na primeira vez, liga a conta Stripe do barbeiro: abre a página de registo da Stripe (IBAN,
  identificação, cerca de 5 minutos). Ao voltar, a opção fica disponível. Na app abre-se no browser
  e volta à app.
- Escolhe o valor: **valor fixo** (ex.: 5 €) **ou percentagem do serviço** (ex.: 30 %).

### Marcar (cliente, página pública)

1. Escolhe serviço e hora como hoje. No passo do serviço já se vê "Sinal de 5 € ao marcar".
2. Se o barbeiro tem o código por email ligado e o cliente é novo, o código vem primeiro (como hoje).
3. Paga o sinal: cartão, MB Way, Apple Pay ou Google Pay (os que a Stripe disponibilizar para a conta
   do barbeiro em Portugal).
4. Enquanto paga, o horário fica **guardado 15 minutos**. Se não pagar, o horário volta a ficar livre.
5. Pagamento confirmado → marcação feita (confirmada, ou pendente se o serviço precisa de aprovação),
   email de confirmação com "Sinal pago: 5 €".

### Depois de marcar

| Situação | Sinal |
|---|---|
| Cliente aparece (concluída) | Desconta no preço. A app mostra "Pagou 5 € · falta 10 €". |
| Cliente cancela online a tempo (dentro do prazo de cancelamento do negócio) | Devolvido automaticamente. |
| Cliente cancela tarde / falta | O barbeiro fica com ele. |
| Cliente muda a hora pelo link | O sinal passa para a nova hora. |
| Barbeiro cancela ou recusa o pedido | Devolvido. |

### Dinheiro

- Pagamento feito na conta Stripe do barbeiro; a taxa da Stripe (≈1,5 % + 0,25 € em cartões europeus)
  é paga pelo barbeiro. A SYCRAS não cobra comissão.

## Restrições

- Web: TanStack Start no Vercel, Stripe SDK `stripe@^17` já usado para o Pro (`src/lib/billing.server.ts`,
  `src/routes/api/stripe/webhook.ts`). Reutilizar o mesmo webhook (acrescentar os eventos novos).
- A marcação pública é criada em `createPublicBooking` (`src/lib/booking.functions.ts`); cancelamento e
  mudança pelo link em `cancelBookingByToken` / `rescheduleBookingByToken`. O cliente só pode cancelar
  online dentro de `cancellation_hours`; depois disso tem de falar com o negócio.
- Estados de marcação existentes: pending, confirmed, completed, cancelled, no_show, expired.
- Base de dados: Supabase (projeto Sycras EU). Migração nova em `supabase/migrations/`, aplicada antes de
  publicar o site.
- App: Expo (`sycras-mobile`), fala com o Supabase e com `/api/*` do site. O build da loja esconde a
  compra do Pro pela Stripe; isso **não** se aplica ao sinal (é um serviço físico do barbeiro, permitido
  pelo Google Play) nem à ligação da conta Stripe do barbeiro.
- Antes de ir para o ar, a conta Stripe da SYCRAS tem de ter o **Connect ativo** (ação do dono no painel
  da Stripe).
- Textos em pt-PT; o site também tem en + 5 traduções (`src/lib/i18n`).

## Decisões minhas (o dono pode corrigir)

- **Um valor para todos os serviços**, não um valor por serviço. Mais simples; a percentagem já adapta o
  sinal ao preço.
- **Mínimo de 1 €** (a Stripe não aceita menos de 0,50 €); a percentagem arredonda ao cêntimo.
- **Barbeiro cancela já dentro do prazo** (ex.: o cliente ligou à última hora): a app pergunta
  "Devolver o sinal?" com "Devolver" e "Ficar com o sinal". Fora do prazo, devolve sempre sem perguntar.
- **Pedido recusado** (serviço com aprovação): devolvido sempre.
- **Falta marcada pelo barbeiro**: fica com o sinal, sem perguntar.
- Se a conta Stripe do barbeiro deixar de poder receber (registo incompleto, conta bloqueada), a página
  **deixa de pedir sinal** em vez de impedir marcações, e a Gestão mostra um aviso para resolver.
- Uma marcação à espera de pagamento **não aparece** na agenda do barbeiro nem conta como marcação; só
  ocupa o horário durante os 15 minutos.

## Deixado a quem constrói

- Tipo de conta Connect e de cobrança, desde que: a taxa da Stripe fique do lado do barbeiro, o dinheiro
  chegue à conta dele e a SYCRAS consiga devolver automaticamente.
- Como guardar o estado do sinal (colunas novas na marcação ou tabela própria) e como libertar horários
  com pagamento abandonado (verificação na disponibilidade e/ou tarefa periódica).
- Página de pagamento: Stripe Checkout alojado ou formulário embebido, desde que funcione no telemóvel e
  volte à página de confirmação.
- Testes automáticos para o cálculo do valor e para as regras de devolução.
