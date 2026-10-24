// Settings stub. Model slots and endpoint validation arrive in T02; data deletion in T04.
export function SettingsView() {
  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      <label className="field">
        <span>Model endpoint</span>
        <input type="url" defaultValue="http://localhost:11434" disabled />
      </label>
      <p className="muted">Your data stays on this computer.</p>
    </section>
  );
}
