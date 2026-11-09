import type { BaseLang } from "../prefs-types";

/** The home page (landing), rebuilt around the phone app's design. */
export const landingDict: Record<BaseLang, Record<string, string>> = {
  pt: {
    "lp.eyebrow": "Para barbearias, salões e clínicas em Portugal",
    "lp.title.a": "A tua agenda cheia.",
    "lp.title.b": "Sem telefonemas.",
    "lp.subtitle":
      "Os clientes marcam sozinhos na tua página, 24 horas por dia. Tu vês tudo numa app simples: o dia, a agenda, os clientes e o dinheiro que entra.",
    "lp.trust.1": "14 dias grátis",
    "lp.trust.2": "Sem cartão",
    "lp.trust.3": "Pronto em 5 minutos",
    "lp.chips.title": "Tudo numa só app",
    "lp.chip.page": "Página de marcações",
    "lp.chip.agenda": "Agenda",
    "lp.chip.clients": "Clientes",
    "lp.chip.reminders": "Lembretes",
    "lp.chip.deposit": "Sinal contra faltas",
    "lp.chip.stats": "Estatísticas",
    "lp.chip.team": "Equipa",
    "lp.chip.loyalty": "Fidelização",

    "lp.diario.kicker": "Diário",
    "lp.diario.title": "O teu dia, num relance.",
    "lp.diario.body":
      "Abres a app e sabes logo quem vem a seguir, quanto já faturaste hoje e o que precisa de ti.",
    "lp.diario.1": "Vês logo quem é o próximo cliente e contacta-o caso necessário.",
    "lp.diario.2": "Aceita ou recusa pedidos pendentes.",
    "lp.diario.3": "Quanto a SYCRAS já te trouxe este mês, em euros",

    "lp.agenda.kicker": "Agenda",
    "lp.agenda.title": "Uma agenda que trabalha por ti.",
    "lp.agenda.body":
      "Todas as marcações, dia a dia, com cores por estado. Mudar uma hora é arrastar com o dedo.",
    "lp.agenda.1": "Toca num espaço livre para marcar; mantém premido para bloquear",
    "lp.agenda.2": "Salta para qualquer dia ou mês com o calendário",
    "lp.agenda.3": "Marca as tuas folgas e férias, os clientes não conseguem marcar nesses dias.",

    "lp.share.kicker": "A tua página",
    "lp.share.title": "A tua página de marcações, pronta a partilhar.",
    "lp.share.body":
      "Um link só teu, sycras.com/o-teu-nome, com serviços, preços, fotos, equipa e mapa. Os clientes só veem horas livres.",
    "lp.share.1": "Partilha a tua página com um toque.",
    "lp.share.2": "Os clientes marcam a qualquer hora, sem criar conta",
    "lp.share.3": "Confirmação automática ou pedidos que tu aprovas",

    "lp.deposit.kicker": "Novo · Sinal contra faltas",
    "lp.deposit.title": "Acabaram-se as cadeiras vazias.",
    "lp.deposit.body":
      "Pede um pequeno sinal quando o cliente marca online. Se aparecer, desconta no preço. Se faltar, fica contigo.",
    "lp.deposit.1": "Valor fixo ou percentagem do serviço, à tua escolha",
    "lp.deposit.2": "Devolvido automaticamente quando o cliente cancela a tempo",
    "lp.deposit.3": "O dinheiro vai direto para a tua conta, sem comissões da SYCRAS",
    "lp.deposit.4": "Código por email para clientes novos e bloqueio de quem falta sempre",
    "lp.deposit.card.service": "Corte · 15 €",
    "lp.deposit.card.line": "Sinal de 4,50 € ao marcar",
    "lp.deposit.card.paid": "Sinal pago: 4,50 € · falta 10,50 €",
    "lp.deposit.card.refund": "Cancelou a tempo: sinal devolvido",

    "lp.clients.kicker": "Clientes",
    "lp.clients.title": "Conhece cada cliente pelo nome.",
    "lp.clients.body":
      "Cada pessoa que marca fica com a sua ficha: visitas, quanto gastou, cancelamentos e todo o histórico.",
    "lp.clients.1": "Encontra quem não volta há muito tempo e chama-o pelo WhatsApp",
    "lp.clients.2": "Cartão de fidelização: a cada N visitas, uma oferta",
    "lp.clients.3": "Bloqueia quem marca e não aparece",

    "lp.reminders.kicker": "Lembretes",
    "lp.reminders.title": "Lembretes que enchem a agenda.",
    "lp.reminders.body":
      "A SYCRAS lembra os teus clientes por ti, por email e WhatsApp, e convida-os a voltar na altura certa.",
    "lp.reminders.1": "Lembrete antes de cada marcação, à hora que escolheres",
    "lp.reminders.2": "Convite para voltar umas semanas depois da última visita",
    "lp.reminders.3": "Pedido de avaliação no Google depois do serviço",
    "lp.reminders.n1.title": "Lembrete · amanhã às 11:00",
    "lp.reminders.n1.body": "Olá Ana, até amanhã na Barbearia Lisboa!",
    "lp.reminders.n2.title": "Está na hora do próximo corte?",
    "lp.reminders.n2.body": "Já passaram 4 semanas. Marca em 30 segundos.",
    "lp.reminders.n3.title": "Gostaste do serviço?",
    "lp.reminders.n3.body": "Deixa-nos uma avaliação no Google.",

    "lp.stats.kicker": "Estatísticas",
    "lp.stats.title": "Os números que importam.",
    "lp.stats.body":
      "Receita, ticket médio, visitas à página e quantas viraram marcações. Por dia, semana ou mês, e por profissional.",
    "lp.stats.1": "Esconde os valores com um toque, quando há clientes a ver",
    "lp.stats.2": "Compara profissionais e serviços",

    "lp.new.kicker": "Marcar à mão",
    "lp.new.title": "Para quem liga ou aparece na porta.",
    "lp.new.body":
      "Nova marcação em três passos: quem, que serviço e quando. A app só mostra horas livres, por isso nunca marcas por cima.",

    "lp.manage.kicker": "Gestão",
    "lp.manage.title": "O teu negócio, arrumado.",
    "lp.manage.body":
      "Serviços, preços, equipa, horários, folgas e regras de marcação, tudo num só sítio. Muda no telemóvel e a página atualiza logo.",

    "lp.all.title": "E muito mais, tudo incluído.",
    "lp.all.1": "Página com fotos, mapa e equipa",
    "lp.all.2": "Marcações 24 horas por dia",
    "lp.all.3": "Agenda dia a dia e lista",
    "lp.all.4": "Arrastar para mudar a hora",
    "lp.all.5": "Bloquear tempo e fechar dias",
    "lp.all.6": "Folgas e férias",
    "lp.all.7": "Vários profissionais",
    "lp.all.8": "Fichas de cliente",
    "lp.all.9": "Clientes perdidos",
    "lp.all.10": "Cartão de fidelização",
    "lp.all.11": "Lembretes por email",
    "lp.all.12": "Lembretes por WhatsApp",
    "lp.all.13": "Convites para voltar",
    "lp.all.14": "Pedidos de avaliação",
    "lp.all.15": "Sinal contra faltas",
    "lp.all.16": "Código anti-marcações falsas",
    "lp.all.17": "Estatísticas completas",
    "lp.all.18": "Notificações no telemóvel",
    "lp.all.19": "Modo claro e escuro",
    "lp.all.20": "Convida e ganha",

    "lp.steps.title": "Começa hoje, em três passos.",
    "lp.steps.1.title": "Cria a tua conta",
    "lp.steps.1.body": "Nome do negócio, serviços e horário. Deixamos tudo pronto a usar.",
    "lp.steps.2.title": "Partilha o teu link",
    "lp.steps.2.body": "No Instagram, no WhatsApp e no Google. Os clientes marcam sozinhos.",
    "lp.steps.3.title": "Acompanha na app",
    "lp.steps.3.body": "Recebe cada marcação no telemóvel e gere o dia num relance.",

    "lp.faq.title": "Perguntas frequentes",
    "lp.faq.5.q": "Como funciona o sinal contra faltas?",
    "lp.faq.5.a":
      "Ligas a tua conta de pagamentos uma vez e escolhes o valor. Quem marca online paga o sinal; se aparecer, desconta no preço; se cancelar a tempo, é devolvido sozinho; se faltar, fica contigo. Está incluído no SYCRAS Pro.",
    "lp.faq.6.q": "Preciso de computador?",
    "lp.faq.6.a":
      "Não. Tudo funciona no telemóvel, na app SYCRAS. Se preferires, também podes gerir tudo pelo site, no computador.",

    "lp.final.title": "A tua próxima marcação pode chegar hoje.",
    "lp.final.body": "14 dias grátis, sem cartão. Cancelas quando quiseres.",
  },
  en: {
    "lp.eyebrow": "For barbers, salons and clinics",
    "lp.title.a": "A full diary.",
    "lp.title.b": "No phone calls.",
    "lp.subtitle":
      "Clients book themselves on your page, around the clock. You see everything in one simple app: your day, your diary, your clients and the money coming in.",
    "lp.trust.1": "14 days free",
    "lp.trust.2": "No card",
    "lp.trust.3": "Ready in 5 minutes",
    "lp.chips.title": "All in one app",
    "lp.chip.page": "Booking page",
    "lp.chip.agenda": "Diary",
    "lp.chip.clients": "Clients",
    "lp.chip.reminders": "Reminders",
    "lp.chip.deposit": "No-show deposits",
    "lp.chip.stats": "Stats",
    "lp.chip.team": "Team",
    "lp.chip.loyalty": "Loyalty",

    "lp.diario.kicker": "Today",
    "lp.diario.title": "Your day at a glance.",
    "lp.diario.body":
      "Open the app and see who is next, what you have earned today and what needs you.",
    "lp.diario.1": "See your next client at once and get in touch if needed.",
    "lp.diario.2": "Accept or decline pending requests.",
    "lp.diario.3": "What SYCRAS brought you this month, in euros",

    "lp.agenda.kicker": "Diary",
    "lp.agenda.title": "A diary that works for you.",
    "lp.agenda.body":
      "Every booking, day by day, coloured by status. Moving one is a drag of the finger.",
    "lp.agenda.1": "Tap a free slot to book; hold it to block time",
    "lp.agenda.2": "Jump to any day or month with the calendar",
    "lp.agenda.3": "Mark your days off and holidays; clients cannot book on those days.",

    "lp.share.kicker": "Your page",
    "lp.share.title": "Your booking page, ready to share.",
    "lp.share.body":
      "A link of your own, sycras.com/your-name, with services, prices, photos, team and map. Clients only see free times.",
    "lp.share.1": "Share your page in one tap.",
    "lp.share.2": "Clients book any time, no account needed",
    "lp.share.3": "Instant confirmation, or requests you approve",

    "lp.deposit.kicker": "New · No-show deposits",
    "lp.deposit.title": "No more empty chairs.",
    "lp.deposit.body":
      "Ask for a small deposit when clients book online. If they come, it comes off the price. If they don't, you keep it.",
    "lp.deposit.1": "A fixed amount or a share of the service, your choice",
    "lp.deposit.2": "Refunded automatically when the client cancels in time",
    "lp.deposit.3": "The money goes straight to your account, no SYCRAS fees",
    "lp.deposit.4": "An email code for new clients, and blocking for repeat no-shows",
    "lp.deposit.card.service": "Haircut · €15",
    "lp.deposit.card.line": "€4.50 deposit when booking",
    "lp.deposit.card.paid": "Deposit paid: €4.50 · €10.50 left",
    "lp.deposit.card.refund": "Cancelled in time: deposit refunded",

    "lp.clients.kicker": "Clients",
    "lp.clients.title": "Know every client by name.",
    "lp.clients.body":
      "Everyone who books gets a card: visits, spend, cancellations and the full history.",
    "lp.clients.1": "Find who hasn't been back for a while and message them on WhatsApp",
    "lp.clients.2": "Loyalty card: every N visits, a reward",
    "lp.clients.3": "Block people who book and never show up",

    "lp.reminders.kicker": "Reminders",
    "lp.reminders.title": "Reminders that fill your diary.",
    "lp.reminders.body":
      "SYCRAS reminds your clients for you, by email and WhatsApp, and invites them back at the right time.",
    "lp.reminders.1": "A reminder before every booking, at the time you choose",
    "lp.reminders.2": "An invitation to come back a few weeks after the last visit",
    "lp.reminders.3": "A Google review request after the service",
    "lp.reminders.n1.title": "Reminder · tomorrow at 11:00",
    "lp.reminders.n1.body": "Hi Ana, see you tomorrow at Barbearia Lisboa!",
    "lp.reminders.n2.title": "Time for your next cut?",
    "lp.reminders.n2.body": "It's been 4 weeks. Book in 30 seconds.",
    "lp.reminders.n3.title": "Did you enjoy it?",
    "lp.reminders.n3.body": "Leave us a review on Google.",

    "lp.stats.kicker": "Stats",
    "lp.stats.title": "The numbers that matter.",
    "lp.stats.body":
      "Revenue, average ticket, page visits and how many became bookings. By day, week or month, and by team member.",
    "lp.stats.1": "Hide the amounts in one tap when clients are watching",
    "lp.stats.2": "Compare team members and services",

    "lp.new.kicker": "Book by hand",
    "lp.new.title": "For people who call or walk in.",
    "lp.new.body":
      "A new booking in three steps: who, which service and when. The app only shows free times, so you never double-book.",

    "lp.manage.kicker": "Manage",
    "lp.manage.title": "Your business, in order.",
    "lp.manage.body":
      "Services, prices, team, hours, days off and booking rules in one place. Change it on your phone and your page updates at once.",

    "lp.all.title": "And much more, all included.",
    "lp.all.1": "Page with photos, map and team",
    "lp.all.2": "Bookings around the clock",
    "lp.all.3": "Day view and list",
    "lp.all.4": "Drag to move a booking",
    "lp.all.5": "Block time and close days",
    "lp.all.6": "Days off and holidays",
    "lp.all.7": "Several team members",
    "lp.all.8": "Client cards",
    "lp.all.9": "Lapsed clients",
    "lp.all.10": "Loyalty card",
    "lp.all.11": "Email reminders",
    "lp.all.12": "WhatsApp reminders",
    "lp.all.13": "Come-back invitations",
    "lp.all.14": "Review requests",
    "lp.all.15": "No-show deposits",
    "lp.all.16": "Anti-fake-booking code",
    "lp.all.17": "Full stats",
    "lp.all.18": "Phone notifications",
    "lp.all.19": "Light and dark mode",
    "lp.all.20": "Invite and earn",

    "lp.steps.title": "Start today, in three steps.",
    "lp.steps.1.title": "Create your account",
    "lp.steps.1.body": "Business name, services and hours. We set everything up for you.",
    "lp.steps.2.title": "Share your link",
    "lp.steps.2.body": "On Instagram, WhatsApp and Google. Clients book on their own.",
    "lp.steps.3.title": "Follow it in the app",
    "lp.steps.3.body": "Get every booking on your phone and run your day at a glance.",

    "lp.faq.title": "Questions",
    "lp.faq.5.q": "How do no-show deposits work?",
    "lp.faq.5.a":
      "Connect your payments account once and choose the amount. People who book online pay the deposit; if they come, it comes off the price; if they cancel in time, it is refunded automatically; if they don't show up, you keep it. Included in SYCRAS Pro.",
    "lp.faq.6.q": "Do I need a computer?",
    "lp.faq.6.a":
      "No. Everything works on your phone, in the SYCRAS app. If you prefer, you can also manage it all on the website, on a computer.",

    "lp.final.title": "Your next booking could come today.",
    "lp.final.body": "14 days free, no card. Cancel any time.",
  },
};
