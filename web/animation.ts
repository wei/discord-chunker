// web/animation.ts
export function createAnimation(): HTMLElement {
  const container = document.createElement("div");
  container.className = "animation-container";
  container.innerHTML = `
    <div class="flow flow-direct">
      <div class="flow-label">Direct to Discord</div>
      <div class="flow-steps">
        <div class="flow-step message-long">📝 Long message (5000 chars)</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step discord-api">Discord API</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step result-error">❌ Error 400 — Content too long</div>
      </div>
    </div>
    <div class="flow flow-proxy">
      <div class="flow-label">Via discord-chunker</div>
      <div class="flow-steps">
        <div class="flow-step message-long">📝 Long message (5000 chars)</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step chunker-proxy">discord.git.ci</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step chunks-split">✂️ Split into 3 chunks</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step result-success">
          <div>✅ Message 1 delivered</div>
          <div>✅ Message 2 delivered</div>
          <div>✅ Message 3 delivered</div>
        </div>
      </div>
    </div>
  `;
  return container;
}
