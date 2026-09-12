import { useEffect, useRef, useState } from "react";

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
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) return existing;
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  return script;
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
    const script = loadScript();

    function mount() {
      if (cancelled || !host.current || !window.grecaptcha?.render || widget.current != null) return;
      const ready = window.grecaptcha.ready?.bind(window.grecaptcha) ?? ((cb: () => void) => cb());
      ready(() => {
        if (cancelled || !host.current || widget.current != null) return;
        try {
          widget.current = window.grecaptcha!.render(host.current, {
            sitekey: siteKey,
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(""),
            "error-callback": () => {
              onTokenRef.current("");
              setFailed(true);
            },
          });
          setMounted(true);
          setFailed(false);
        } catch {
          setFailed(true);
        }
      });
    }

    script.addEventListener("load", mount);
    script.addEventListener("error", () => setFailed(true));
    const timer = window.setInterval(mount, 250);
    const timeout = window.setTimeout(() => {
      if (widget.current == null) setFailed(true);
    }, 8000);

    return () => {
      cancelled = true;
      script.removeEventListener("load", mount);
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [siteKey]);

  return (
    <div className="overflow-visible">
      <div ref={host} className="flex min-h-[78px] justify-center overflow-visible" />
      {failed && !mounted && (
        <p className="mt-2 text-center text-xs text-rose-600">
          The I’m not a robot box could not load. Confirm the key is reCAPTCHA v2 checkbox and the domain is
          {" "}<span className="font-mono">linkboostgrowth.site</span> (no https).
        </p>
      )}
    </div>
  );
}
