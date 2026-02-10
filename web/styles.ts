// web/styles.ts — Discord-themed CSS
export const STYLES = `
/* === Discord Design Tokens === */
:root {
  --bg-tertiary: #1e1f22;
  --bg-secondary: #2b2d31;
  --bg-primary: #313338;
  --bg-modifier-hover: #2e3035;
  --bg-modifier-active: #35373c;
  --brand: #5865F2;
  --brand-hover: #4752C4;
  --green: #57F287;
  --green-hover: #3CC267;
  --red: #ED4245;
  --yellow: #FEE75C;
  --text-normal: #dbdee1;
  --text-primary: #f2f3f5;
  --text-secondary: #b5bac1;
  --text-muted: #949ba4;
  --text-link: #00AFF4;
  --border-subtle: #3f4147;
  --border-strong: #4e5058;
  --font-primary: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-code: "Consolas", "Andale Mono WT", "Andale Mono", "Lucida Console",
    "Lucida Sans Typewriter", "DejaVu Sans Mono", "Bitstream Vera Sans Mono",
    "Liberation Mono", "Nimbus Mono L", Monaco, "Courier New", Courier, monospace;
  --radius-sm: 3px;
  --radius-md: 8px;
}

/* === Reset & Base === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; }
body {
  font-family: var(--font-primary);
  background: var(--bg-tertiary);
  color: var(--text-normal);
  line-height: 1.375;
  min-height: 100vh;
}

/* === Layout === */
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

/* === Header === */
.header {
  text-align: center;
  margin-bottom: 3rem;
}
.header-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.header-logo svg { width: 40px; height: 40px; }
.header h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}
.header .tagline {
  font-size: 1.125rem;
  color: var(--text-secondary);
  max-width: 540px;
  margin: 0 auto;
}

/* === Sections === */
.section {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.section-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

/* === Inputs (Discord-style) === */
.input-wrapper { position: relative; }
.dc-input {
  width: 100%;
  padding: 10px 12px;
  font-family: var(--font-primary);
  font-size: 1rem;
  color: var(--text-normal);
  background: var(--bg-tertiary);
  border: none;
  border-radius: var(--radius-sm);
  outline: none;
  transition: box-shadow 0.15s ease;
}
.dc-input:focus { box-shadow: 0 0 0 2px var(--brand); }
.dc-input::placeholder { color: var(--text-muted); }

.dc-textarea {
  width: 100%;
  padding: 12px;
  font-family: var(--font-code);
  font-size: 0.875rem;
  color: var(--text-normal);
  background: var(--bg-tertiary);
  border: none;
  border-radius: var(--radius-sm);
  outline: none;
  resize: vertical;
  min-height: 200px;
  line-height: 1.5;
  transition: box-shadow 0.15s ease;
}
.dc-textarea:focus { box-shadow: 0 0 0 2px var(--brand); }

/* === Buttons (Discord-style) === */
.dc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 8px 16px;
  font-family: var(--font-primary);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.17s ease, color 0.17s ease;
  white-space: nowrap;
}
.dc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dc-btn-brand { background: var(--brand); color: #fff; }
.dc-btn-brand:hover:not(:disabled) { background: var(--brand-hover); }
.dc-btn-green { background: var(--green); color: #000; }
.dc-btn-green:hover:not(:disabled) { background: var(--green-hover); }
.dc-btn-secondary { background: var(--bg-modifier-active); color: var(--text-normal); }
.dc-btn-secondary:hover:not(:disabled) { background: var(--border-strong); }
.dc-btn-outline {
  background: transparent;
  color: var(--text-normal);
  border: 1px solid var(--border-strong);
}
.dc-btn-outline:hover:not(:disabled) { background: var(--bg-modifier-hover); }

/* === URL Converter Output === */
.converted-output {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 10px 12px;
  margin-top: 0.75rem;
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--brand);
}
.converted-output code {
  flex: 1;
  font-family: var(--font-code);
  font-size: 0.875rem;
  color: var(--text-link);
  word-break: break-all;
}

/* === Action Bar === */
.actions {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
  flex-wrap: wrap;
}

/* === Discord Message Cards (pixel-perfect) === */
.chunk-results { margin-top: 1rem; }
.chunk-count {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.dc-message {
  display: flex;
  padding: 0.125rem 1rem 0.125rem 4.5rem;
  position: relative;
  min-height: 2.75rem;
  margin-top: 1.0625rem;
}
.dc-message:hover { background: var(--bg-modifier-hover); }

.dc-message-avatar {
  position: absolute;
  left: 1rem;
  top: 0.125rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dc-message-avatar svg { width: 24px; height: 24px; fill: #fff; }

.dc-message-content { flex: 1; min-width: 0; }

.dc-message-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  line-height: 1.375;
}
.dc-message-username {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
}
.dc-message-username:hover { text-decoration: underline; }
.dc-message-tag {
  font-size: 0.625rem;
  font-weight: 500;
  background: var(--brand);
  color: #fff;
  padding: 0.0625rem 0.275rem;
  border-radius: 0.1875rem;
  text-transform: uppercase;
  vertical-align: top;
  position: relative;
  top: 0.1rem;
}
.dc-message-timestamp {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 400;
}

.dc-message-body {
  font-size: 1rem;
  line-height: 1.375;
  color: var(--text-normal);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}

.dc-message-chunk-badge {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 0.5rem;
  vertical-align: middle;
}

/* Message group container — mimics Discord chat area */
.dc-message-group {
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  padding: 0.5rem 0;
  overflow: hidden;
}

/* Subsequent messages in group (no avatar/header) */
.dc-message-continuation {
  padding: 0.125rem 1rem 0.125rem 4.5rem;
  min-height: auto;
  margin-top: 0;
}
.dc-message-continuation .dc-message-body {
  padding-top: 0.125rem;
}

/* Chunk separator line */
.dc-chunk-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  margin: 0.25rem 0;
}
.dc-chunk-divider::before,
.dc-chunk-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}
.dc-chunk-divider span {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

/* === Comparison Animation === */
.animation-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}
@media (max-width: 640px) {
  .animation-container { grid-template-columns: 1fr; }
}

.flow {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  text-align: center;
}
.flow-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}
.flow-steps {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.flow-step {
  padding: 0.625rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  font-weight: 500;
  width: 100%;
  max-width: 280px;
}
.flow-arrow {
  color: var(--text-muted);
  font-size: 1.25rem;
  line-height: 1;
}
.message-long {
  background: var(--bg-primary);
  color: var(--text-normal);
  border: 1px solid var(--border-subtle);
}
.discord-api, .chunker-proxy {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}
.chunker-proxy { border: 1px solid var(--brand); color: var(--brand); }
.chunks-split { background: var(--bg-tertiary); color: var(--text-secondary); }
.result-error {
  background: rgba(237, 66, 69, 0.1);
  color: var(--red);
  border: 1px solid rgba(237, 66, 69, 0.3);
}
.result-success {
  background: rgba(87, 242, 135, 0.1);
  color: var(--green);
  border: 1px solid rgba(87, 242, 135, 0.3);
}
.result-success div { padding: 0.125rem 0; }

/* Animation keyframes */
.flow-step, .flow-arrow {
  opacity: 0;
  animation: fadeSlideIn 0.4s ease forwards;
}
.flow-steps > :nth-child(1) { animation-delay: 0.1s; }
.flow-steps > :nth-child(2) { animation-delay: 0.3s; }
.flow-steps > :nth-child(3) { animation-delay: 0.5s; }
.flow-steps > :nth-child(4) { animation-delay: 0.7s; }
.flow-steps > :nth-child(5) { animation-delay: 0.9s; }
.flow-steps > :nth-child(6) { animation-delay: 1.1s; }
.flow-steps > :nth-child(7) { animation-delay: 1.3s; }

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === Status Toast === */
.status-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%) translateY(100%);
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  opacity: 0;
  transition: transform 0.3s ease, opacity 0.3s ease;
  z-index: 1000;
  pointer-events: none;
}
.status-toast.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}
.status-toast.success { background: var(--green); color: #000; }
.status-toast.error { background: var(--red); color: #fff; }

/* === Footer === */
.footer {
  text-align: center;
  padding-top: 2rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.footer a {
  color: var(--text-link);
  text-decoration: none;
}
.footer a:hover { text-decoration: underline; }

/* === Responsive === */
@media (max-width: 768px) {
  .page { padding: 1.5rem 1rem; }
  .header h1 { font-size: 1.5rem; }
  .header .tagline { font-size: 1rem; }
  .section { padding: 1.25rem; }
  .dc-message { padding-left: 3.5rem; }
  .dc-message-avatar { width: 32px; height: 32px; }
}
`;
