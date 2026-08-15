import { Link, useLocation } from "react-router-dom";
import { BRAND_NAME, BRAND_SHORT } from "@/brand";
import { Card } from "@/components/ui";

const UPDATED = "15 August 2026";

export function RefundPolicyPage() {
  return (
    <LegalArticle title="Refund Policy" intro={`At ${BRAND_SHORT}, customer satisfaction is a top priority. Due to the nature of our services, certain conditions apply to refund eligibility. Please read this policy carefully.`}>
      <LegalSection n={1} title="General Policy">
        <p>All payments made on our platform are final. Refunds are only considered under the specific conditions listed in this policy. Users are responsible for ensuring that all order details, including links and instructions, are correct before placing an order.</p>
      </LegalSection>
      <LegalSection n={2} title="Non-Refundable Situations">
        <p>Refunds will not be issued under the following circumstances:</p>
        <ul>
          <li>Incorrect or invalid link provided by the user.</li>
          <li>Failure to follow the service instructions or terms stated on the order page.</li>
          <li>Account being private (the profile must stay public during and after the service).</li>
          <li>Over-ordering the same service before the first order completes.</li>
          <li>Drops or losses caused by social media platform updates.</li>
        </ul>
      </LegalSection>
      <LegalSection n={3} title="Refund Eligibility">
        <p>
          Refunds are only applicable if the service status shows “Completed” but the order did not deliver any results, or the service you chose has exceeded its average delivery time plus 24 hours and still has not delivered. In those cases, open a support ticket with your order details for review.
        </p>
      </LegalSection>
      <LegalSection n={4} title="Refund Method">
        <p>
          Approved refunds are credited to your {BRAND_SHORT} wallet only. That balance can be used for future orders on this platform. We do not issue cash or external refunds through payment gateways, mobile money, or bank transfers.
        </p>
      </LegalSection>
      <LegalSection n={5} title="Disputes and Chargebacks">
        <p>
          Starting a chargeback or dispute without contacting support first may result in account suspension. Reach out through the support system if something goes wrong.
        </p>
      </LegalSection>
      <LegalSection n={6} title="Contact Support">
        <p>
          For refund questions, open a support ticket from your dashboard. The support team reviews requests within 24–48 hours.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalArticle title="Terms of Service" intro={`Welcome to ${BRAND_NAME}. By registering for an account or using our services, you (“the User”) agree to these Terms of Service and our Refund Policy.`}>
      <LegalSection n={1} title="General Terms & Modification">
        <p>
          By placing an order with {BRAND_SHORT}, you accept the terms below. We may update these Terms at any time. It is your responsibility to review them periodically. Continued use after changes are posted means you accept the updated Terms.
        </p>
      </LegalSection>
      <LegalSection n={2} title="User Account & Security">
        <p>
          You are responsible for keeping your account and password confidential, and for all activity under your account. Your social profile must be public before you place an order. If it is not, the order may fail without a refund.
        </p>
      </LegalSection>
      <LegalSection n={3} title="Payments, Fraud & Termination">
        <p>Rates can change at any time without notice. Delivery times are estimates only; we do not guarantee an exact delivery timeframe.</p>
        <p className="mt-3">
          <strong>Fraudulent activity:</strong> adding funds with stolen cards, unauthorized payment methods, or starting a chargeback or dispute without contacting support first will result in immediate, permanent account termination and forfeiture of all funds.
        </p>
      </LegalSection>
      <LegalSection n={4} title="Prohibited Activities">
        <p>You agree not to use our services for any illegal or unauthorized purpose, including copyright violations.</p>
        <ul>
          <li>You may not use the service to promote nudity, adult content, or other inappropriate material.</li>
          <li>You may not use the service for harassment, defamation, or threats.</li>
          <li>You must follow the terms of third-party platforms (Instagram, Facebook, TikTok, and others).</li>
        </ul>
      </LegalSection>
      <LegalSection n={5} title="Refund Policy">
        <p>
          All purchases are final. Eligibility for a refund, partial refund, or refill is governed exclusively by our{" "}
          <LegalLink to="refund">Refund Policy</LegalLink>
          , which is part of these Terms. Read it before you order.
        </p>
      </LegalSection>
      <LegalSection n={6} title="Disclaimer of Liability">
        <p>
          {BRAND_SHORT} is not liable for damages, losses, or consequences arising from use of the services. We are not affiliated with Instagram, Facebook, TikTok, or any other third-party platform.
        </p>
      </LegalSection>
      <LegalSection n={7} title="Contact & Support">
        <p>
          For questions about these Terms or to report an issue,{" "}
          <LegalLink to="support">open a support ticket</LegalLink>.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}

function LegalLink({ to, children }: { to: "refund" | "support"; children: React.ReactNode }) {
  const inApp = useLocation().pathname.startsWith("/app");
  const href = to === "refund"
    ? (inApp ? "/app/refund-policy" : "/refund-policy")
    : (inApp ? "/app/support" : "/login");
  return <Link to={href} className="font-semibold text-brand-700 hover:underline">{children}</Link>;
}

function LegalArticle({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{intro}</p>
      <Card className="mt-5 space-y-6 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{children}</Card>
      <p className="mt-4 text-xs text-muted">Last updated: {UPDATED}</p>
    </div>
  );
}

function LegalSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-brand-800 dark:text-brand-200">
        <span aria-hidden>✅ </span>
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
