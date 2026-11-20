import { h } from '../lib/dom.js';
import { get, patch, post } from '../lib/api.js';
import { session } from '../lib/session.js';
import { button, busy, card, cardHead, confirm, notice, toast, toastError } from '../lib/ui.js';

/**
 * Settings → Integrations: the free keys the Details page uses (Gemini,
 * Tavily, SerpApi and optionally PageSpeed), the studio's offers and prices
 * the pitch quotes, and how long research is kept. Owner only.
 */

const KEYS = [
  { id: 'gemini', field: 'geminiKey', label: 'Gemini API key', need: 'Needed', where: 'aistudio.google.com/apikey', href: 'https://aistudio.google.com/apikey', text: 'Reads the pages and writes the documents. Free; on the free tier Google may use what’s sent to improve its products.' },
  { id: 'tavily', field: 'tavilyKey', label: 'Tavily API key', need: 'Needed', where: 'app.tavily.com', href: 'https://app.tavily.com', text: 'Searches the web. 1,000 free searches a month; a quick research uses about 12, a thorough one about 22.' },
  { id: 'serpapi', field: 'serpapiKey', label: 'SerpApi key', need: 'Optional', where: 'serpapi.com/manage-api-key', href: 'https://serpapi.com/manage-api-key', text: 'Adds the Google Maps rating, reviews and the owner’s replies. 250 free searches a month; each research uses 2.' },
  { id: 'pagespeed', field: 'pagespeedKey', label: 'PageSpeed API key', need: 'Optional', where: 'console.cloud.google.com/apis/credentials', href: 'https://console.cloud.google.com/apis/credentials', text: 'Free. Without one, Google’s speed test sometimes refuses; enable “PageSpeed Insights API” for the key.' },
];

const field = (label, control, hint) => h('div.field', h('label', label), control, hint && h('div.field-hint', hint));

export async function researchSettingsCard() {
  if (!session.can('owner')) return card(cardHead('Details research'), h('div.card-body', h('p.small.muted', 'Only the owner can see and change the research keys.')));
  let data;
  try {
    data = await get('/api/research/settings');
  } catch (error) {
    toastError(error);
    return null;
  }
  const holder = h('div.stack.loose');
  const results = h('div.stack.tight');

  const draw = () => {
    const inputs = {};
    const ready = data.gemini.connected && data.tavily.connected;
    const keyRows = KEYS.map((key) => {
      const state = data[key.id];
      inputs[key.field] = h('input.input', { type: 'password', autocomplete: 'off', placeholder: state.connected ? `Saved (${state.hint}). Paste a new one to replace it.` : 'Paste the key' });
      return h(
        'div.field',
        h('label', key.label, h(`span.pill${key.need === 'Needed' ? '.brand' : ''}`, { style: { marginLeft: '6px' } }, key.need), state.connected ? h('span.pill.success.dot', { style: { marginLeft: '4px' } }, 'Saved') : null),
        inputs[key.field],
        h('div.field-hint', key.text, ' Get one at ', h('a', { href: key.href, target: '_blank', rel: 'noopener', dataset: { external: '' } }, key.where), '.', key.id === 'gemini' && state.used ? ` Last model used: ${state.used}.` : ''),
        state.connected &&
          h(
            'div',
            button('Remove', {
              small: true,
              kind: 'danger',
              onClick: async (event) => {
                if (!(await confirm({ title: `Remove the ${key.label}?`, message: key.need === 'Needed' ? 'New research can’t start without it.' : 'Research carries on without it.', confirmLabel: 'Remove', danger: true }))) return;
                await busy(event.currentTarget, async () => {
                  data = await patch('/api/research/settings', { [key.field]: '' });
                  draw();
                });
              },
            }),
          ),
      );
    });
    const model = h('input.input', { value: data.gemini.model ?? '', placeholder: 'Automatic: the best free model' });

    const save = button('Save keys', {
      kind: 'primary',
      onClick: async (event) =>
        busy(event.currentTarget, async () => {
          const body = {};
          for (const [name, input] of Object.entries(inputs)) if (input.value.trim()) body[name] = input.value.trim();
          if (model.value.trim() !== (data.gemini.model ?? '')) body.geminiModel = model.value.trim();
          if (!Object.keys(body).length) return toast('Paste a key first.', { type: 'error' });
          data = await patch('/api/research/settings', body);
          toast('Saved. Testing them…');
          draw();
          await test();
        }),
    });
    const test = async () => {
      const out = await post('/api/research/settings/test', {});
      results.replaceChildren(
        ...KEYS.filter((key) => out[key.id]).map((key) => {
          const result = out[key.id];
          return notice(result.ok ? `${key.label}: works${result.model ? ` (model ${result.model})` : ''}${result.left !== undefined && result.left !== null ? `, ${result.left} searches left this month` : ''}.` : `${key.label}: ${result.message}`, { kind: result.ok ? 'success' : 'danger', glyph: result.ok ? 'checkCircle' : 'alertCircle' });
        }),
      );
      if (!Object.keys(out).length) results.replaceChildren(notice('No keys saved yet.', { glyph: 'info' }));
    };
    const testButton = button('Test keys', { onClick: async (event) => busy(event.currentTarget, test) });

    /* Offers: the packages the pitch can quote, with your own prices. */
    const offers = data.offers.map((offer) => ({ ...offer }));
    const offerList = h('div.stack');
    const drawOffers = () =>
      offerList.replaceChildren(
        ...offers.map((offer, index) => {
          const bind = (key, el) => {
            el.addEventListener('input', () => (offer[key] = el.value));
            return el;
          };
          const lead = h('input', { type: 'radio', name: 'lead-offer', checked: Boolean(offer.lead) });
          lead.addEventListener('change', () => offers.forEach((item) => (item.lead = item === offer)));
          return h(
            'div.card',
            { style: { padding: '14px', boxShadow: 'none' } },
            h(
              'div.form-grid.cols-2',
              field('Code and name', h('div.row', { style: { gap: '8px' } }, bind('code', h('input.input', { value: offer.code, maxLength: 3, style: { width: '64px' } })), bind('name', h('input.input', { value: offer.name, maxLength: 40 })))),
              field('Takes', bind('duration', h('input.input', { value: offer.duration, maxLength: 30, placeholder: 'e.g. 7–10 days, or monthly' }))),
              field('Price', bind('price', h('input.input', { value: offer.price, maxLength: 40, placeholder: 'e.g. ₹25,000–40,000' }))),
              h('div.field', h('label', 'Lead with this'), h('label.row', { style: { gap: '8px' } }, lead, 'The pitch opens with this offer')),
              h('div.field.span-2', h('label', 'What it includes'), bind('text', h('textarea.textarea', { rows: 2, value: offer.text, maxLength: 400 }))),
            ),
            offers.length > 1 && h('div', { style: { marginTop: '8px' } }, button('Remove this offer', { small: true, onClick: () => (offers.splice(index, 1), drawOffers()) })),
          );
        }),
      );
    drawOffers();

    const studio = h('input.input', { value: data.studioName ?? '', maxLength: 80 });
    const keep = h('input.input', { type: 'number', min: 7, max: 730, value: data.keepDays ?? 90, style: { maxWidth: '120px' } });

    holder.replaceChildren(
      card(
        cardHead('Details research', ready ? h('span.pill.success.dot', 'Ready') : h('span.pill.warning.dot', 'Needs keys')),
        h(
          'div.card-body.stack',
          h('p.small.muted', `The Details page looks businesses up with three free services. Make a free account with each and paste its key. Keys are stored ${session.hosted ? 'sealed in the admin’s database' : 'in the admin’s own data on this computer'} and never shown again in full.`),
          ...keyRows,
          field('Gemini model', model, 'Leave empty: the admin picks the best free model, and moves to another when one’s daily allowance runs out.'),
          h('div.row.wrap', save, testButton),
          results,
        ),
      ),
      card(
        cardHead('Offers in the pitch'),
        h(
          'div.card-body.stack',
          h('p.small.muted', 'The two-page summary quotes only these offers and prices; the AI tailors what each includes to the business. The one marked “lead” is the one the pitch opens with.'),
          offerList,
          h(
            'div.row.wrap',
            button('Add an offer', { glyph: 'plus', onClick: () => (offers.length < 6 ? (offers.push({ code: String.fromCharCode(65 + offers.length), name: '', duration: '', price: '', text: '', lead: false }), drawOffers()) : toast('Six offers at most.', { type: 'error' })) }),
            button('Save offers', {
              kind: 'primary',
              onClick: async (event) =>
                busy(event.currentTarget, async () => {
                  data = await patch('/api/research/settings', { offers });
                  toast('Offers saved.');
                  draw();
                }),
            }),
            data.customOffers &&
              button('Use the suggested offers', {
                onClick: async (event) =>
                  busy(event.currentTarget, async () => {
                    data = await patch('/api/research/settings', { offers: null });
                    draw();
                  }),
              }),
          ),
        ),
      ),
      card(
        cardHead('Research records'),
        h(
          'div.card-body.stack',
          field('Studio name', studio, 'How the documents name your studio.'),
          field('Keep research for (days)', keep, 'Older research and its documents are deleted automatically.'),
          h(
            'div',
            button('Save', {
              kind: 'primary',
              onClick: async (event) =>
                busy(event.currentTarget, async () => {
                  data = await patch('/api/research/settings', { studioName: studio.value, keepDays: Number(keep.value) });
                  toast('Saved.');
                  draw();
                }),
            }),
          ),
        ),
      ),
    );
  };
  draw();
  return holder;
}
