import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "light" | "dark";
          size?: "normal" | "compact";
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        }
      ) => number;
      reset: (id?: number) => void;
    };
    __lwhRecaptchaReady?: () => void;
  }
}

const SCRIPT_ID = "google-recaptcha-v2";

function loadScript() {
  if (document.getElementById(SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://www.google.com/recaptcha/api.js?onload=__lwhRecaptchaReady&render=explicit";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export function RecaptchaBox({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const widget = useRef<number | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    setFailed(false);
    setMounted(false);

    function mount() {
      if (cancelled || !host.current || !window.grecaptcha?.render || widget.current != null) return Boolean(widget.current != null);
      try {
        widget.current = window.grecaptcha.render(host.current, {
          sitekey: siteKey,
          theme: "light",
          size: "normal",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => {
            onTokenRef.current("");
            setFailed(true);
          },
        });
        setMounted(true);
        setFailed(false);
        return true;
      } catch {
        return false;
      }
    }

    window.__lwhRecaptchaReady = () => {
      window.grecaptcha?.ready(() => {
        mount();
      });
    };
    loadScript();
    if (window.grecaptcha?.render) window.__lwhRecaptchaReady();

    const timer = window.setInterval(() => {
      if (mount()) window.clearInterval(timer);
    }, 300);
    const timeout = window.setTimeout(() => {
      if (widget.current == null) setFailed(true);
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [siteKey]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <div ref={host} className="g-recaptcha min-h-[78px]" />
      </div>
      {!mounted && !failed && (
        <p className="mt-2 text-center text-xs text-slate-500">Loading I’m not a robot…</p>
      )}
      {failed && !mounted && (
        <p className="mt-2 text-center text-xs text-rose-600">
          The tick box could not load. Redeploy the site, and confirm the key is reCAPTCHA v2 checkbox with domain
          {" "}<span className="font-mono">linkboostgrowth.site</span>.
        </p>
      )}
    </div>
  );
}
