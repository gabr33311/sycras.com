import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactEmail, Entity, LegalPage } from "@/components/legal-page";
import { TRIAL_DAYS } from "@/lib/subscription";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Utilização — SYCRAS" },
      {
        name: "description",
        content: "As regras de utilização da SYCRAS, do período experimental e da subscrição.",
      },
      // Not indexed until the responsible entity is filled in.
      // Always reachable (footer, app, Google Play) but kept out of search results,
      // so the provider details (NIF) are not found by searching.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Termos de Utilização">
      <section>
        <p>
          Estes termos regulam a utilização da SYCRAS, um serviço online de marcações para negócios.
          Ao criar uma conta, aceitas estes termos e a{" "}
          <Link to="/privacidade" className="font-semibold text-brand-ink underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>1. Quem presta o serviço</h2>
        <p>
          A SYCRAS é disponibilizada por <Entity withNif />. Contacto: <ContactEmail />.
        </p>
      </section>

      <section>
        <h2>2. O serviço</h2>
        <p>
          A SYCRAS permite a um negócio ter uma página pública de marcações, gerir a agenda, os
          serviços, a equipa e os clientes, e enviar emails de confirmação e lembretes. Os clientes
          do negócio podem marcar, ver e cancelar as suas marcações sem criar conta.
        </p>
      </section>

      <section>
        <h2>3. Conta</h2>
        <ul>
          <li>Tens de indicar dados verdadeiros e manter o email atualizado.</li>
          <li>
            És responsável por manter a palavra-passe segura e por tudo o que é feito na conta.
          </li>
          <li>
            Só podes criar uma conta para um negócio que representes ou para o qual tenhas
            autorização.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Período experimental e subscrição</h2>
        <ul>
          <li>
            Cada negócio tem {TRIAL_DAYS} dias grátis a contar da criação, sem pedir cartão, com a
            página de marcações, a agenda, os clientes e a equipa.
          </li>
          <li>
            Algumas funcionalidades são exclusivas do plano Pro pago e não fazem parte do período
            experimental: lembretes automáticos aos clientes (por email e WhatsApp), o sinal
            opcional contra faltas, pedidos de avaliação depois da visita, bloqueio de clientes e
            estatísticas completas. Esta lista aparece também nos preços e no registo, antes de
            criares conta.
          </li>
          <li>
            Depois desse período, para continuar a usar a SYCRAS é necessário o plano Pro: 19 € por
            mês, ou 180 € por ano. Os preços incluem IVA à taxa legal em vigor, quando aplicável.
          </li>
          <li>
            A subscrição renova-se automaticamente no fim de cada período. É cobrada pelo Stripe no
            método de pagamento indicado ou, quando subscrita na app para Android, pela Google Play.
          </li>
          <li>
            Podes cancelar a qualquer momento em Negócio → SYCRAS Pro → Gerir subscrição e faturas
            (ou na Google Play, se subscreveste na app). O cancelamento produz efeitos no fim do
            período já pago; não há reembolso de períodos parciais, salvo quando a lei o exija.
          </li>
          <li>
            Sem subscrição ativa no fim do período experimental, ou se um pagamento falhar e não for
            regularizado, a conta fica bloqueada: a página pública deixa de aceitar marcações, mas
            os dados mantêm-se e voltam a ficar acessíveis ao subscrever.
          </li>
          <li>
            Se os preços mudarem, avisamos com pelo menos 30 dias de antecedência; a alteração só se
            aplica no período seguinte.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Responsabilidades do negócio</h2>
        <ul>
          <li>
            O negócio é responsável pelos serviços que presta, pelos preços que mostra e pela
            relação com os seus clientes, incluindo cancelamentos, faltas e reembolsos.
          </li>
          <li>
            O negócio é o responsável pelos dados pessoais dos seus clientes e deve tratá-los de
            acordo com o RGPD. A SYCRAS trata esses dados por conta do negócio, apenas para prestar
            o serviço.
          </li>
          <li>
            O negócio garante que tem direito a usar os textos, logótipos e imagens que publica.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Utilização aceitável</h2>
        <p>Não é permitido usar a SYCRAS para:</p>
        <ul>
          <li>atividades ilegais, fraudulentas ou enganosas;</li>
          <li>enviar spam ou mensagens não solicitadas;</li>
          <li>publicar conteúdo ofensivo, ilegal ou que viole direitos de terceiros;</li>
          <li>
            tentar aceder a dados de outros negócios, sobrecarregar o serviço ou contornar as suas
            proteções.
          </li>
        </ul>
        <p>Podemos suspender contas que violem estas regras.</p>
      </section>

      <section>
        <h2>7. Disponibilidade</h2>
        <p>
          Esforçamo-nos por manter a SYCRAS sempre disponível, mas podem existir interrupções para
          manutenção ou por falhas de terceiros. O serviço pode evoluir: podemos acrescentar,
          alterar ou retirar funcionalidades, avisando quando a mudança for relevante.
        </p>
      </section>

      <section>
        <h2>8. Responsabilidade</h2>
        <p>
          Na medida permitida por lei, a SYCRAS não responde por danos indiretos, como lucros
          cessantes ou perda de clientes, resultantes da utilização ou da impossibilidade de
          utilização do serviço. Nada nestes termos limita direitos que a lei garanta e que não
          possam ser afastados por contrato.
        </p>
      </section>

      <section>
        <h2>9. Fim da conta</h2>
        <p>
          Podes eliminar a conta a qualquer momento, sozinho, nas Definições da app ou do site, ou
          pedir ajuda através de <ContactEmail />. Antes disso, podes pedir uma cópia dos teus dados
          em Definições → Conta → Exportar os meus dados. Os dados são tratados como descrito na
          Política de Privacidade.
        </p>
      </section>

      <section>
        <h2>10. Alterações a estes termos</h2>
        <p>
          Podemos atualizar estes termos. Se a alteração for relevante, avisamos na app ou por email
          antes de entrar em vigor.
        </p>
      </section>

      <section>
        <h2>11. Lei aplicável e litígios</h2>
        <p>
          Estes termos regem-se pela lei portuguesa. Em caso de litígio de consumo, podes recorrer a
          uma entidade de resolução alternativa de litígios; a lista está disponível no Portal do
          Consumidor (
          <a
            href="https://www.consumidor.gov.pt"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-ink underline"
          >
            consumidor.gov.pt
          </a>
          ). Podes também usar o Livro de Reclamações Eletrónico (
          <a
            href="https://www.livroreclamacoes.pt"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-ink underline"
          >
            livroreclamacoes.pt
          </a>
          ).
        </p>
      </section>
    </LegalPage>
  );
}
