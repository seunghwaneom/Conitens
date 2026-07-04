import React from "react";
import { ForwardApprovalCenterPanel } from "../components/ForwardApprovalCenterPanel.js";
import type { ForwardBridgeConfig } from "../forward-bridge.js";

interface ApprovalsScreenProps {
  isDemo: boolean;
  showConnectForm: boolean;
  setShowConnectForm: React.Dispatch<React.SetStateAction<boolean>>;
  draftConfig: ForwardBridgeConfig;
  setDraftConfig: React.Dispatch<React.SetStateAction<ForwardBridgeConfig>>;
  connect: (event: React.FormEvent) => void;
  config: ForwardBridgeConfig;
}

export function ApprovalsScreen({
  isDemo,
  showConnectForm,
  setShowConnectForm,
  draftConfig,
  setDraftConfig,
  connect,
  config,
}: ApprovalsScreenProps) {
  return (
    <main className="forward-main">
      {isDemo ? (
        <div className="forward-demo-banner">
          <span>Connect to a live bridge to review approval records.</span>
          <button type="button" onClick={() => setShowConnectForm((v) => !v)}>
            {showConnectForm ? "Hide form" : "Connect to live bridge"}
          </button>
        </div>
      ) : null}
      {showConnectForm ? (
        <section className="forward-setup">
          <form className="forward-form" onSubmit={connect}>
            <label>
              <span>API root</span>
              <input
                value={draftConfig.apiRoot}
                onChange={(event) => setDraftConfig((current) => ({ ...current, apiRoot: event.target.value }))}
                placeholder="http://127.0.0.1:8785/api"
              />
            </label>
            <label>
              <span>Bearer token</span>
              <input
                type="password"
                autoComplete="off"
                value={draftConfig.token}
                onChange={(event) => setDraftConfig((current) => ({ ...current, token: event.target.value }))}
                placeholder="Paste token from `ensemble forward serve`"
              />
            </label>
            <button type="submit">Connect</button>
          </form>
        </section>
      ) : null}
      {!isDemo ? (
        <ForwardApprovalCenterPanel config={config} heading="All approvals" />
      ) : (
        <div className="forward-placeholder">
          <h3>Approval queue requires a live bridge</h3>
          <p>Approval records are sensitive operational data, so the global queue appears only after a bearer token is loaded.</p>
        </div>
      )}
    </main>
  );
}
