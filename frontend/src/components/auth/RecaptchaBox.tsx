import { useEffect, useRef } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        }
      ) => number;
      reset: (id?: number) => void;
    };
  }
}

const SCRIPT_ID = "google-recaptcha-v2";

function loadScript() {
  if (document.getElementById(SCRIPT_ID) || window.grecaptcha) return;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
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
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) return;
    loadScript();
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (cancelled || !host.current || !window.grecaptcha || widget.current != null) return;
      window.clearInterval(timer);
      window.grecaptcha.ready(() => {
        if (cancelled || !host.current || widget.current != null) return;
        widget.current = window.grecaptcha!.render(host.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [siteKey]);

  return <div ref={host} className="flex justify-center" />;
}
