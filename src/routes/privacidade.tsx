import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactEmail, Entity, LegalPage } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — SYCRAS" },
      {
        name: "description",
        content: "Que dados a SYCRAS trata, para quê, com quem os partilha e os teus direitos.",
      },
      // Not indexed until the responsible entity is filled in.
      ...(LEGAL.ready ? [] : [{ name: "robots", content: "noindex" }]),
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <section>
        <p>
          Esta política explica que dados pessoais a SYCRAS trata, porquê, durante quanto tempo e
          que direitos tens. Aplica-se ao site sycras.com, à aplicação de gestão usada pelos
          negócios e às páginas de marcação usadas pelos clientes desses negócios.
        </p>
      </section>

      <section>
        <h2>1. Quem é o responsável</h2>
        <p>
          O responsável pelo tratamento dos dados das contas SYCRAS é <Entity withNif />. Para
          qualquer questão sobre privacidade, contacta <ContactEmail />.
        </p>
        <p>
          Quando um cliente faz uma marcação num negócio que usa a SYCRAS, o{" "}
          <strong>negócio</strong> é o responsável pelos dados desse cliente e a SYCRAS trata-os por
          conta dele, como subcontratante, apenas para prestar o serviço de marcações.
        </p>
      </section>

      <section>
        <h2>2. Que dados tratamos</h2>
        <p>
          <strong>Donos e equipas de negócios (utilizadores da app):</strong>
        </p>
        <ul>
          <li>Nome, email e palavra-passe (guardada cifrada, nunca em texto legível).</li>
          <li>
            Dados do negócio: nome, tipo, contactos, morada, localização no mapa, logótipo, banner,
            serviços, preços, horários, equipa e preferências.
          </li>
          <li>
            Dados de subscrição: plano, estado e datas. Os dados do cartão são tratados diretamente
            pelo Stripe ou pela Google Play; a SYCRAS não os vê nem os guarda.
          </li>
          <li>
            Na app para telemóvel: um código do aparelho para enviar notificações (só se as
            aceitares) e a localização do telemóvel, apenas quando carregas em &quot;Usar a minha
            localização&quot; para marcar a loja no mapa.
          </li>
          <li>
            Registos de erros da app (o ecrã e a mensagem do erro, sem conteúdo das marcações), para
            corrigirmos falhas. São apagados ao fim de 90 dias.
          </li>
        </ul>
        <p>
          <strong>Clientes que fazem marcações:</strong>
        </p>
        <ul>
          <li>Nome, telefone e, se o indicarem, email.</li>
          <li>
            Marcações (serviço, data, hora, estado) e notas que o cliente ou o negócio escrevam.
          </li>
        </ul>
        <p>
          <strong>Dados técnicos:</strong> para evitar abusos (por exemplo, marcações falsas em
          massa) guardamos uma versão cifrada e irreversível do endereço IP de quem marca, junto com
          a hora do pedido.
        </p>
      </section>

      <section>
        <h2>3. Para que usamos os dados</h2>
        <ul>
          <li>Criar e gerir a tua conta e o teu negócio na SYCRAS.</li>
          <li>Receber, confirmar, alterar e cancelar marcações.</li>
          <li>Avisar no telemóvel de marcações novas, pedidos e cancelamentos.</li>
          <li>
            Enviar emails de serviço: código de confirmação da conta, confirmação de marcação e
            lembretes automáticos antes da marcação (quando o negócio os tem ligados).
          </li>
          <li>Gerir a subscrição e os pagamentos.</li>
          <li>Proteger o serviço contra fraude e abuso.</li>
        </ul>
        <p>
          Não vendemos dados, não os usamos para publicidade e não enviamos emails de marketing sem
          consentimento.
        </p>
      </section>

      <section>
        <h2>4. Fundamento legal</h2>
        <ul>
          <li>
            <strong>Execução de contrato:</strong> para prestar o serviço que pedes (conta,
            marcações, emails de serviço, subscrição).
          </li>
          <li>
            <strong>Interesse legítimo:</strong> para a segurança do serviço e prevenção de abusos.
          </li>
          <li>
            <strong>Obrigação legal:</strong> para guardar os registos de faturação exigidos por
            lei.
          </li>
          <li>
            <strong>Consentimento:</strong> para as notificações no telemóvel (que só recebes se as
            autorizares) e para emails de novidades, se um dia os subscreveres. Podes retirar o
            consentimento a qualquer momento, sem afetar o que foi feito antes.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Com quem partilhamos</h2>
        <p>Usamos estes prestadores, apenas na medida necessária para o serviço funcionar:</p>
        <ul>
          <li>
            <strong>Supabase</strong>: base de dados, autenticação e armazenamento de imagens.
          </li>
          <li>
            <strong>Vercel</strong>: alojamento do site e da aplicação.
          </li>
          <li>
            <strong>Resend</strong>: envio de emails.
          </li>
          <li>
            <strong>Stripe</strong>: pagamentos das subscrições.
          </li>
          <li>
            <strong>Google Play e RevenueCat</strong>: pagamentos de subscrições feitas na app para
            Android.
          </li>
          <li>
            <strong>Google Firebase</strong>: envio das notificações para o telemóvel.
          </li>
          <li>
            <strong>Meta (WhatsApp Business)</strong>: quando um negócio liga os lembretes por
            WhatsApp, a SYCRAS envia ao cliente, pela API oficial do WhatsApp, a mensagem de
            lembrete (nome, serviço, dia e hora da marcação) para o número de telemóvel indicado na
            marcação.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong>: verificação contra robôs no formulário público de
            marcação.
          </li>
          <li>
            <strong>OpenStreetMap, OpenFreeMap, GeoAPI.pt e Photon</strong>: mapa e pesquisa de
            moradas quando um negócio escolhe a localização da loja. Só é enviado o texto
            pesquisado.
          </li>
          <li>
            <strong>Esri (ArcGIS)</strong>: imagens de satélite do mapa na página dos negócios. Só é
            pedida a zona do mapa a mostrar.
          </li>
          <li>
            <strong>Google Maps</strong>: só quando alguém carrega em "Ver no mapa"; abre o Google
            Maps com a localização do negócio.
          </li>
        </ul>
        <p>
          Alguns destes prestadores podem tratar dados fora do Espaço Económico Europeu,
          nomeadamente nos Estados Unidos. Nesses casos, a transferência é feita com as garantias
          previstas no RGPD, como as cláusulas contratuais-tipo da Comissão Europeia ou o EU-US Data
          Privacy Framework.
        </p>
      </section>

      <section>
        <h2>6. Durante quanto tempo</h2>
        <ul>
          <li>Dados da conta e do negócio: enquanto a conta estiver ativa.</li>
          <li>
            Marcações e dados de clientes: enquanto o negócio usar a SYCRAS, ou até o negócio os
            apagar.
          </li>
          <li>
            Após o fecho de uma conta, os dados são apagados num prazo razoável, exceto os que a lei
            obrigue a guardar (por exemplo, registos de faturação).
          </li>
          <li>Registos técnicos de segurança: o tempo necessário para prevenir abusos.</li>
          <li>
            Códigos de confirmação enviados por email antes de uma marcação: válidos 10 minutos e
            apagados no dia seguinte.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. Cookies e armazenamento no navegador</h2>
        <p>
          A SYCRAS não usa cookies de publicidade nem de rastreio. Guardamos no teu navegador apenas
          o necessário para a app funcionar: a sessão iniciada, o tema, o idioma, a vista do mapa
          (normal ou satélite) e se fechaste um aviso.
        </p>
        <p>
          Quando alguém abre a página de um negócio, guardamos no separador do navegador um número
          aleatório da visita, apagado quando o separador fecha, só para contar cada visita uma vez
          nas estatísticas desse negócio. Não identifica a pessoa.
        </p>
        <p>
          Para sabermos que páginas são visitadas, usamos estatísticas anónimas do Vercel Web
          Analytics: não usam cookies, não identificam pessoas e não seguem ninguém entre sites.
        </p>
      </section>

      <section>
        <h2>8. Os teus direitos</h2>
        <p>
          Tens direito a aceder aos teus dados, corrigi-los, apagá-los, limitar ou opor-te ao seu
          tratamento e recebê-los num formato portátil. Para exercer estes direitos, contacta{" "}
          <ContactEmail />.
        </p>
        <p>
          Podes eliminar a tua conta e todos os dados do teu negócio a qualquer momento, sozinho,
          nas Definições da app ou do site.{" "}
          <Link to="/eliminar-conta" className="font-semibold text-brand-ink underline">
            Ver como eliminar a conta
          </Link>
          .
        </p>
        <p>
          Se és cliente de um negócio que usa a SYCRAS, podes também pedir diretamente ao negócio,
          que é o responsável pelos teus dados de marcação.
        </p>
        <p>
          Tens ainda o direito de apresentar reclamação à Comissão Nacional de Proteção de Dados
          (CNPD), em{" "}
          <a
            href="https://www.cnpd.pt"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-ink underline"
          >
            cnpd.pt
          </a>
          .
        </p>
      </section>

      <section>
        <h2>9. Segurança</h2>
        <p>
          As comunicações são cifradas (HTTPS), as palavras-passe são guardadas cifradas e o acesso
          aos dados de cada negócio está limitado a quem pertence a esse negócio.
        </p>
      </section>

      <section>
        <h2>10. Alterações</h2>
        <p>
          Podemos atualizar esta política. Se a alteração for relevante, avisamos na app ou por
          email. A data da última versão está no topo desta página. Consulta também os{" "}
          <Link to="/termos" className="font-semibold text-brand-ink underline">
            Termos de Utilização
          </Link>
          .
        </p>
      </section>
    </LegalPage>
  );
}
