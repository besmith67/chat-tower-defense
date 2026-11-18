/**
 * The Emote Studio: a setup screen that lists a channel's 7TV, BTTV, and FFZ emotes as the species
 * they generate. The streamer can rename an emote, disable it, give it a signature ability, or mark
 * it as a boss candidate. Choices save per channel in the browser.
 *
 * Twitch's own sub emotes are not listed: reading them needs a Twitch login (roadmap M3.6).
 */
import { EmoteDirectory } from '../chat/emoteDirectory';
import { TwitchChatSource } from '../chat/twitch';
import type { ChatEmote } from '../chat/types';
import { makeGenome } from '../genome';
import { ELEMENT_INFO, FAMILY_INFO, QUIRK_INFO } from '../genome/describe';
import { ABILITIES, type Ability } from '../genome/lexiconFormat';
import { loadStudio, saveStudio, type StudioConfig } from '../sim/studio';

const PAGE = 60;

export async function openStudio(channel: string): Promise<void> {
  const dialog = buildDialog(channel);
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());

  const status = dialog.querySelector<HTMLElement>('.studio-status')!;
  status.textContent = `Looking up #${channel}…`;
  const roomId = await findRoomId(channel);
  if (!roomId) {
    status.textContent = `Could not find #${channel} on Twitch. Check the spelling and try again.`;
    return;
  }
  status.textContent = 'Loading emotes from 7TV, BTTV, and FFZ…';
  const directory = new EmoteDirectory();
  await directory.loadChannel(roomId);
  const emotes = directory.channelEmotes();
  if (!emotes.length) {
    status.textContent = 'This channel has no 7TV, BTTV, or FFZ emotes. Twitch sub emotes need a login, which is not supported yet.';
    return;
  }
  status.textContent = `${emotes.length} emotes. Changes save automatically for #${channel}.`;

  const config = loadStudio(channel);
  const grid = dialog.querySelector<HTMLElement>('.studio-grid')!;
  const search = dialog.querySelector<HTMLInputElement>('.studio-search')!;
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const matches = emotes.filter((e) => !q || e.name.toLowerCase().includes(q));
    grid.replaceChildren(...matches.slice(0, PAGE).map((e) => card(e, config, channel)));
    if (matches.length > PAGE) {
      const more = document.createElement('p');
      more.className = 'studio-more';
      more.textContent = `${matches.length - PAGE} more. Search to find them.`;
      grid.append(more);
    }
  };
  search.addEventListener('input', render);
  render();
}

function buildDialog(channel: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'studio';
  dialog.innerHTML = `
    <header>
      <div>
        <h2>Emote Studio</h2>
        <p class="hint">How #${escapeHtml(channel)}'s emotes become monsters. Rename, disable, or give them a signature ability.</p>
      </div>
      <button type="button" class="studio-close" aria-label="Close">Done</button>
    </header>
    <p class="studio-status"></p>
    <input class="studio-search" placeholder="Search emotes" spellcheck="false" />
    <div class="studio-grid"></div>`;
  dialog.querySelector('.studio-close')!.addEventListener('click', () => dialog.close());
  return dialog;
}

function card(emote: ChatEmote, config: StudioConfig, channel: string): HTMLElement {
  const entry = (config[emote.id] ??= {});
  const genome = makeGenome(emote.name, { emote });
  const el = document.createElement('div');
  el.className = 'studio-card';

  const summary: string[] = [];
  if (genome?.element) summary.push(`${ELEMENT_INFO[genome.element].icon} ${ELEMENT_INFO[genome.element].label}`);
  if (genome?.family) summary.push(FAMILY_INFO[genome.family].label);
  if (genome) summary.push(genome.formClass === 'balanced' ? 'Balanced' : genome.formClass === 'round' ? 'Round' : 'Spiky');
  if (genome?.archetype) summary.push(genome.archetype);
  const quirks = genome?.quirks.map((q) => QUIRK_INFO[q].label).join(', ');

  el.innerHTML = `
    <img src="${encodeURI(emote.url)}" alt="" loading="lazy" />
    <div class="studio-body">
      <b>${escapeHtml(emote.name)}</b> <span class="hint">${emote.provider.toUpperCase()}</span>
      <p class="hint">${escapeHtml(summary.join(' · '))}${quirks ? `<br>${escapeHtml(quirks)}` : ''}</p>
      <label>Name <input name="name" maxlength="20" placeholder="${escapeHtml(emote.name)}" /></label>
      <label>Ability <select name="ability"><option value="">Generated</option>${ABILITIES.map((a) => `<option value="${a}">${a}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="boss" /> Boss candidate</label>
      <label class="check"><input type="checkbox" name="disabled" /> Disabled</label>
    </div>`;

  const name = el.querySelector<HTMLInputElement>('input[name="name"]')!;
  const ability = el.querySelector<HTMLSelectElement>('select[name="ability"]')!;
  const boss = el.querySelector<HTMLInputElement>('input[name="boss"]')!;
  const disabled = el.querySelector<HTMLInputElement>('input[name="disabled"]')!;
  name.value = entry.name ?? '';
  ability.value = entry.ability ?? '';
  boss.checked = !!entry.boss;
  disabled.checked = !!entry.disabled;
  el.classList.toggle('off', !!entry.disabled);

  const save = () => {
    entry.name = name.value.trim() || undefined;
    entry.ability = (ability.value || undefined) as Ability | undefined;
    entry.boss = boss.checked || undefined;
    entry.disabled = disabled.checked || undefined;
    el.classList.toggle('off', disabled.checked);
    saveStudio(channel, config);
  };
  for (const input of [name, ability, boss, disabled]) input.addEventListener('change', save);
  return el;
}

/** Joins the channel's chat anonymously just long enough to learn its numeric id. */
function findRoomId(channel: string): Promise<string | null> {
  return new Promise((resolve) => {
    const source = new TwitchChatSource(channel);
    const done = (id: string | null) => {
      clearTimeout(timer);
      off();
      source.stop();
      resolve(id);
    };
    const timer = setTimeout(() => done(null), 10000);
    const off = source.on((event) => {
      if (event.type === 'room') done(event.roomId);
    });
    source.start();
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
