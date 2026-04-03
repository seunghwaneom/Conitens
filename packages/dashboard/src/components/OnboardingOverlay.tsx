import { useState } from "react";

export function OnboardingOverlay() {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("conitens.onboarded") === "true");

  if (dismissed) return null;

  const dismiss = () => { localStorage.setItem("conitens.onboarded", "true"); setDismissed(true); };
  const next = () => step < 2 ? setStep(step + 1) : dismiss();

  const steps = [
    { title: "Welcome to Conitens", body: "A local-first multi-agent orchestration OS. Monitor and manage AI agents collaborating on development tasks — all from your browser.", code: undefined, action: "Next" },
    { title: "Connect Your Bridge", body: "Launch the bridge server, then paste the token to see live agent data.", code: "python scripts/ensemble.py --workspace . forward serve", action: "Next" },
    { title: "Explore", body: "Three views await: Forward Shell for run monitoring, Pixel Office for spatial visualization, and Agents for fleet management.", code: undefined, action: "Get Started" },
  ];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-steps">
          {steps.map((_, i) => <span key={i} className={`onboarding-dot${i === step ? " active" : ""}`} />)}
        </div>
        <h2>{steps[step].title}</h2>
        <p>{steps[step].body}</p>
        {steps[step].code && <code className="onboarding-code">{steps[step].code}</code>}
        <div className="onboarding-actions">
          <button className="onboarding-skip" onClick={dismiss}>Skip</button>
          <button className="onboarding-next" onClick={next}>{steps[step].action}</button>
        </div>
      </div>
    </div>
  );
}
