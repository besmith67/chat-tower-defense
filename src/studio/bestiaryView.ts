/** The bestiary viewer: every species this channel's chat has sent, and who discovered it. */
import { ELEMENT_INFO, FAMILY_INFO } from '../genome/describe';
import type { Element, Family } from '../genome/lexiconFormat';
import { Bestiary } from '../sim/bestiary';

export function openBestiary(channel: string, live?: Bestiary): void {
  if (document.querySelector('dialog.bestiary')) return;
  const bestiary = live ?? Bestiary.load(channel);
  const entries = Object.values(bestiary.entries).sort((a, b) => b.sent - a.sent);
  const dialog = document.createElement('dialog');
  dialog.className = 'studio bestiary';
  dialog.innerHTML = `
    <header>
      <div>
        <h2>Bestiary</h2>
        <p class="hint">${entries.length} species discovered by ${channel ? `#${escapeHtml(channel)}'s` : 'your'} chat. The first viewer to send a species gets the credit forever.</p>
      </div>
      <button type="button" class="studio-close">Done</button>
    </header>
    <input class="studio-search" placeholder="Search species or viewers" spellcheck="false" />
    <div class="studio-grid"></div>`;
  document.body.append(dialog);
  dialog.querySelector('.studio-close')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());

  const grid = dialog.querySelector<HTMLElement>('.studio-grid')!;
  const search = dialog.querySelector<HTMLInputElement>('.studio-search')!;
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const shown = entries.filter((e) => !q || e.token.toLowerCase().includes(q) || e.discoveredBy.toLowerCase().includes(q)).slice(0, 120);
    if (!shown.length) {
      grid.innerHTML = `<p class="studio-more">${entries.length ? 'No matches.' : 'Nothing yet. Species appear here once chat sends them in a wave.'}</p>`;
      return;
    }
    grid.replaceChildren(
      ...shown.map((e) => {
        const card = document.createElement('div');
        card.className = 'studio-card';
        const face = e.emoteUrl
          ? `<img src="${encodeURI(e.emoteUrl)}" alt="" loading="lazy" />`
          : `<span class="bestiary-face">${e.emoji ?? (e.element ? ELEMENT_INFO[e.element as Element].icon : '●')}</span>`;
        const tags = [e.element ? ELEMENT_INFO[e.element as Element].label : null, e.family ? FAMILY_INFO[e.family as Family].label : null].filter(Boolean).join(' · ');
        card.innerHTML = `${face}
          <div class="studio-body">
            <b>${escapeHtml(e.token)}</b>
            <p class="hint">${escapeHtml(tags || 'No meaning')}</p>
            <p>Discovered by <b>${escapeHtml(e.discoveredBy)}</b> on ${escapeHtml(e.discoveredAt)}</p>
            <p class="hint">Sent ${e.sent}× · reached the base ${e.leaks}×</p>
          </div>`;
        return card;
      }),
    );
  };
  search.addEventListener('input', render);
  render();
  dialog.showModal();
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
