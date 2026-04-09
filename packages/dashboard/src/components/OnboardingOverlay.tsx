import { useState } from "react";

export function OnboardingOverlay() {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("conitens.onboarded") === "true");

  if (dismissed) return null;

  const dismiss = () => { localStorage.setItem("conitens.onboarded", "true"); setDismissed(true); };
  const next = () => step < 2 ? setStep(step + 1) : dismiss();

  const steps = [
    {
      title: "Welcome to Conitens",
      body: "Use the control plane to inspect runs, approvals, rooms, and agent activity without leaving the shell.",
      code: undefined,
      action: "Next",
    },
    {
      title: "Connect the bridge",
      body: "Launch the bridge server, then paste the token to switch the shell from demo data to live runtime state.",
      code: "python scripts/ensemble.py --workspace . forward serve",
      action: "Next",
    },
    {
      title: "Use the shell",
      body: "Runs is the primary workspace. Spatial Lens adds room topology, and Agents exposes fleet-level status and proposal flow.",
      code: undefined,
      action: "Dismiss",
    },
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
          <button className="onboarding-skip" type="button" onClick={dismiss}>Skip</button>
          <button className="onboarding-next" type="button" onClick={next}>{steps[step].action}</button>
        </div>
      </div>
    </div>
  );
}
