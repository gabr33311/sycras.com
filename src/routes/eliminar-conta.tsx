import { createFileRoute, Link } from "@tanstack/react-router";
import { ContactEmail, LegalPage } from "@/components/legal-page";
import { seo } from "@/lib/seo";

// Public page (asked by Google Play): how to delete a SYCRAS account and what goes with it.
export const Route = createFileRoute("/eliminar-conta")({
  head: () =>
    seo({
      title: "Eliminar conta — SYCRAS",
      description: "Como eliminar a tua conta SYCRAS e os dados que são apagados.",
      path: "/eliminar-conta",
    }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <LegalPage title="Eliminar conta">
      <section>
        <p>
          Podes eliminar a tua conta SYCRAS a qualquer momento, sozinho, na app ou no site. Não
          precisas de falar connosco.
        </p>
      </section>

      <section>
        <h2>Na app para telemóvel</h2>
        <ol>
          <li>
            Abre a app SYCRAS, vai ao separador Negócio (o último em baixo) e toca na roda dentada,
            no canto de cima.
          </li>
          <li>Em Conta, toca em &quot;Eliminar conta&quot;.</li>
          <li>Escreve ELIMINAR e toca em &quot;Eliminar para sempre&quot;.</li>
        </ol>
      </section>

      <section>
        <h2>No site</h2>
        <ol>
          <li>
            Entra em{" "}
            <Link to="/auth" search={{ mode: undefined, next: undefined }}>
              sycras.com
            </Link>{" "}
            e abre Negócio → Definições.
          </li>
          <li>Em Conta, carrega em &quot;Eliminar conta&quot;.</li>
          <li>Escreve ELIMINAR e confirma.</li>
        </ol>
      </section>

      <section>
        <h2>O que é apagado</h2>
        <ul>
          <li>A conta (nome, email e palavra-passe).</li>
          <li>
            Se és o dono do negócio: o negócio, a página de marcações, os serviços, a equipa, os
            horários, as marcações, os clientes, as fotos e as notificações.
          </li>
          <li>Se fazes parte da equipa de outro negócio: só sais dessa equipa.</li>
          <li>Uma subscrição paga pelo site é cancelada automaticamente.</li>
        </ul>
        <p>
          A eliminação é imediata e não dá para desfazer. Guardamos apenas o que a lei obriga (por
          exemplo, registos de faturação), pelo prazo legal.
        </p>
        <p>
          Se pagas o Pro pela Google Play, cancela primeiro a subscrição na Google Play: só a Google
          a pode cancelar.
        </p>
      </section>

      <section>
        <h2>Sem acesso à conta?</h2>
        <p>
          Se já não consegues entrar, envia um email para <ContactEmail /> a partir do email da
          conta, a pedir a eliminação. Tratamos o pedido em até 30 dias.
        </p>
      </section>
    </LegalPage>
  );
}
