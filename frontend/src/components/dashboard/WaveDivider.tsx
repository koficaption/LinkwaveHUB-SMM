export function WaveDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`relative -mx-4 overflow-hidden sm:-mx-6 lg:-mx-8 ${className}`} aria-hidden>
      <svg className="block h-16 w-full sm:h-20" viewBox="0 0 1440 120" preserveAspectRatio="none">
        <path fill="#087F68" fillOpacity="0.18" d="M0,48 C240,112 480,0 720,48 C960,96 1200,16 1440,56 L1440,120 L0,120 Z" />
        <path fill="#087F68" fillOpacity="0.55" d="M0,72 C200,16 460,120 720,72 C980,24 1220,104 1440,64 L1440,120 L0,120 Z" />
        <path fill="#087F68" d="M0,96 C280,48 560,120 840,88 C1120,56 1280,104 1440,80 L1440,120 L0,120 Z" />
      </svg>
      <div className="h-3 bg-brand-600" />
    </div>
  );
}
