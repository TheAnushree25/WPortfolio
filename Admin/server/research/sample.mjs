import crypto from 'node:crypto';
import { DEFAULT_OFFERS, mergeOffers } from './write.mjs';

/**
 * A made-up example run (“Riverside Care Hospital”, with invented names,
 * reserved example numbers and a .example website) so the Details page can
 * show the review screen and both PDFs before any keys are added. Nothing
 * in it is about a real business.
 */

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

const fact = (id, section, label, text, { confidence = 'confirmed', url = 'https://riversidecare.example/', quote = '', origin = 'source', shareable = true, include = true, flag = '' } = {}) => ({ id, section, label, text, quote, url, sourceId: origin === 'check' ? 'check' : 'S1', origin, identity: confidence === 'confirmed' ? 'strong' : 'name', verified: confidence !== 'unverified', confidence, shareable, include, flag, also: [] });

export function sampleRun(user) {
  const date = today();
  const input = {
    business: 'Riverside Care Hospital (example)',
    city: 'Kolkata',
    person: 'Dr. A. Sen',
    role: 'Managing Director',
    phones: ['90000 00001', '90000 00002'],
    emails: [],
    website: 'https://riversidecare.example',
    address: '12 River Road, Example Nagar, Kolkata 700000',
    pincode: '700000',
    links: [],
    industry: 'hospital',
    depth: 'quick',
    notes: '',
  };
  const facts = [
    fact('F1', 'contact', 'Decision-maker', 'Dr. A. Sen is named as Managing Director on the website’s About page.', { quote: 'Dr. A. Sen, Managing Director', shareable: false }),
    fact('F2', 'contact', 'Front desk', 'Google Maps, Facebook and the website list 90000 00001 as the main number.', { origin: 'check', url: '' }),
    fact('F3', 'contact', 'Admin office', 'The hiring posts give 90000 00002, a different number.', { quote: 'Call the admin office on 90000 00002', shareable: false }),
    fact('F4', 'business', 'Facilities', '60 beds, 2 operation theatres, 24-hour emergency, X-ray, ultrasound and an in-house lab.', { quote: '60 beds · 2 OTs · 24-hour emergency · X-ray · USG · lab' }),
    fact('F5', 'business', 'Services', 'General surgery, maternity, orthopaedics, paediatrics and ENT.', { quote: 'Surgery, Maternity, Orthopaedics, Paediatrics, ENT' }),
    fact('F6', 'events', 'New wing', 'A 40-bed wing and a dialysis unit open in March 2027, says a Facebook post of 2 November 2026.', { quote: 'our new 40-bed wing with dialysis opens March 2027', url: 'https://www.facebook.com/example', shareable: false }),
    fact('F7', 'events', 'Hiring', 'Staff nurses and a front-desk manager are wanted, per posts on 18 October and 5 November 2026.', { quote: 'Hiring: staff nurses, front desk manager', url: 'https://www.facebook.com/example', shareable: false }),
    fact('F8', 'paperwork', 'Company', 'Riverside Care Pvt Ltd (example) was incorporated in 2015, per a public company register.', { confidence: 'probable', quote: 'Date of incorporation: 2015', url: 'https://registry.example/riverside-care', shareable: false }),
    fact('F9', 'online', 'Website', 'The website opens and is built with Wix; its copyright line still says 2019.', { origin: 'check', flag: 'problem' }),
    fact('F10', 'online', 'Not built for phones', 'The website isn’t set up for phone screens (it has no mobile viewport).', { origin: 'check', flag: 'problem' }),
    fact('F11', 'online', 'Speed on phones', 'Google PageSpeed gives the site 31/100 on a phone; the main content takes 7.8 s to appear.', { origin: 'check', flag: 'problem' }),
    fact('F12', 'online', 'Google Maps', 'Google Maps: 4.1★ from 212 reviews; website linked; open 24 hours.', { origin: 'check' }),
    fact('F13', 'online', 'Review replies', '3 of the 10 newest Google reviews have a reply from the business.', { origin: 'check', flag: 'problem' }),
    fact('F14', 'person', 'Other company', 'A Dr. A. Sen is listed as a director of Riverside Care Pvt Ltd; probably the same person.', { confidence: 'probable', quote: 'Directors: A. Sen', url: 'https://registry.example/riverside-care', shareable: false }),
    fact('F15', 'online', 'Old cover photo', 'The Facebook cover still shows the building before the extension.', { confidence: 'unverified', include: false, flag: 'quote', url: 'https://www.facebook.com/example' }),
  ];
  const summary = {
    title: 'Riverside Care Hospital: the lead and the pitch',
    keyFact: { heading: 'A new 40-bed wing opens in March', text: 'A Facebook post of 2 November 2026 announces a 40-bed wing and a dialysis unit for March 2027, and staff are being hired now. They have a deadline, and a reason to fix how they look online.', factIds: ['F6', 'F7'] },
    bottomLine: { heading: 'Approach now, before the launch', text: 'Their website and listings are out of date, and you can reach the admin office directly. Offer the 10-day “get found again” package (₹25,000–40,000, half upfront).' },
    tiles: [
      { value: '60 beds', label: '100 after March 2027' },
      { value: '2', label: 'operation theatres' },
      { value: '4.1★', label: 'Google, 212 reviews' },
      { value: '3 of 10', label: 'new reviews answered' },
      { value: '31/100', label: 'PageSpeed on a phone' },
      { value: 'Wix', label: 'website, © 2019' },
    ],
    sections: [
      { key: 'contact', title: 'Who to contact', bullets: [
        { lead: 'Decision-maker:', text: 'Dr. A. Sen, Managing Director, named on the website’s About page.', mark: 'dot', factIds: ['F1'] },
        { lead: 'WhatsApp first:', text: '90000 00002, the admin office number on the hiring posts.', mark: 'dot', factIds: ['F3'] },
        { lead: 'Not through reception:', text: '90000 00001 is the public front-desk number on Maps, Facebook and the site.', mark: 'dot', factIds: ['F2'] },
        { lead: 'Email:', text: 'two Gmail addresses; none on the hospital’s own domain.', mark: 'dot', factIds: [] },
        { lead: 'Address:', text: '12 River Road, Example Nagar, Kolkata 700000.', mark: 'dot', factIds: [] },
      ] },
      { key: 'business', title: 'The hospital', bullets: [
        { lead: 'Facilities:', text: '60 beds, 2 operation theatres, 24-hour emergency, X-ray, ultrasound and an in-house lab.', mark: 'dot', factIds: ['F4'] },
        { lead: 'Services:', text: 'general surgery, maternity, orthopaedics, paediatrics and ENT; dialysis from March 2027.', mark: 'dot', factIds: ['F5', 'F6'] },
        { lead: 'Payment:', text: 'cashless with three insurance networks named on its site; no government scheme mentioned anywhere.', mark: 'dot', factIds: [] },
      ] },
      { key: 'events', title: 'What’s happening', bullets: [
        { lead: 'New wing:', text: '40 beds and a dialysis unit, opening March 2027 (Facebook, 2 November 2026).', mark: 'dot', factIds: ['F6'] },
        { lead: 'Hiring:', text: 'staff nurses and a front-desk manager (posts on 18 October and 5 November 2026).', mark: 'dot', factIds: ['F7'] },
      ] },
      { key: 'paperwork', title: 'Registrations', bullets: [
        { lead: 'Company:', text: 'Riverside Care Pvt Ltd (example), incorporated in 2015, per a public company register.', mark: 'dot', factIds: ['F8'] },
      ] },
      { key: 'online', title: 'What people find online today', bullets: [
        { lead: 'Website dated:', text: 'a 2019 Wix site with no layout for phones; the copyright line still says 2019.', mark: 'cross', factIds: ['F9', 'F10'] },
        { lead: 'Slow on phones:', text: 'PageSpeed scores it 31/100; the main content takes 7.8 seconds to appear.', mark: 'cross', factIds: ['F11'] },
        { lead: 'Google Maps:', text: '4.1★ from 212 reviews, but only 3 of the 10 newest have a reply.', mark: 'cross', factIds: ['F12', 'F13'] },
        { lead: 'New wing not online:', text: 'the March opening appears only in one Facebook post.', mark: 'cross', factIds: ['F6'] },
        { lead: 'No careers page:', text: 'vacancies go out only as Facebook posts.', mark: 'cross', factIds: ['F7'] },
        { lead: 'Contacts scattered:', text: 'two phone numbers and two Gmail addresses across the site, Maps and Facebook.', mark: 'cross', factIds: ['F2', 'F3'] },
      ] },
      { key: 'person', title: 'The person', bullets: [
        { lead: '', text: 'Probably the Dr. A. Sen listed as a director of Riverside Care Pvt Ltd; the register and the website don’t give the same full name.', mark: 'dot', factIds: ['F14'] },
      ] },
      { key: 'needs', title: 'What they most likely need', bullets: [
        { lead: 'Before March:', text: 'a site that announces the new wing and dialysis, with call and WhatsApp buttons.', mark: 'dot', factIds: ['F6'] },
        { lead: 'For the hiring drive:', text: 'a careers page with a simple apply form.', mark: 'dot', factIds: ['F7'] },
        { lead: 'Reputation:', text: 'replies to the unanswered reviews, and one number everywhere.', mark: 'dot', factIds: ['F13'] },
      ] },
    ],
    limits: 'This is a made-up example showing the format: the hospital, people, numbers and pages are invented. A real summary lists what was checked on which date, and what could not be read (pages behind a login, for example).',
    verdict: { heading: 'Yes, before the launch', text: 'The new wing gives them a deadline and a budget line. Lead with the 10-day package; offer the brand refresh only if they ask about signs.', need: 'high', access: 'through staff', budget: 'likely', timing: 'now' },
    pitchSentence: 'Patients will look up your new dialysis unit before they visit. In 10 days I’ll make what they find match the hospital: a fast mobile website with the new wing, Google and Facebook up to date, and every review answered.',
    fixes: [
      { today: 'Dated Wix website', fix: 'Bilingual, mobile-first site', offer: 'A' },
      { today: 'Slow on phones', fix: 'Light pages, compressed photos', offer: 'A' },
      { today: '7 reviews unanswered', fix: 'Reply to every review', offer: 'A' },
      { today: 'Wing not announced', fix: 'Launch page, Google and Facebook posts', offer: 'A' },
      { today: 'No careers page', fix: 'Careers page with an apply form', offer: 'A' },
      { today: 'Two phone numbers', fix: 'One helpline with WhatsApp', offer: 'A' },
      { today: 'Old building photos', fix: 'New photos, cover and signs', offer: 'B' },
    ],
    steps: [
      { title: 'Prepare, half a day', text: 'the health check; a homepage concept with the new wing and a one-tap call button; a one-sheet price list; two or three sites you’ve built.' },
      { title: 'First contact, Day 0', text: 'WhatsApp the admin office with the health check attached. No reply in a day: call. Weekdays, late morning.' },
      { title: 'Meeting, 15–20 minutes', text: 'ask who runs Facebook and Google, what the new wing needs by March, who approves and the budget; then show the concept and recommend A.' },
      { title: 'Close', text: '50% advance, 50% at launch; domain, hosting and Google profile in the hospital’s name; two rounds of changes.' },
      { title: 'Follow up', text: 'Day 1 call · Day 3 send the concept · Day 7 one new finding · Day 14 a polite last note.' },
    ],
    objections: [
      { says: 'We already have a website.', reply: 'It’s from 2019 and takes nearly 8 seconds to open on a phone; patients leave before it loads.' },
      { says: 'Facebook is enough.', reply: 'Most patients search Google first, where 7 of the 10 newest reviews have no reply.' },
      { says: 'It’s too expensive.', reply: 'Start with the 10-day package: half now, half at launch.' },
      { says: 'Our IT person handles this.', reply: 'Good. I’ll set it up and hand everything over so they can keep it going.' },
    ],
    offers: mergeOffers(
      [
        { code: 'A', text: 'A bilingual, mobile-first site with a page for the new wing and dialysis, OPD timings, insurance, careers and one-tap call and WhatsApp; the Google profile completed and every review answered; Facebook refreshed.', note: '' },
        { code: 'B', text: 'One logo, colours and fonts; signs and boards for the new wing; cards, letterhead and social templates.', note: 'Offer only if they’re keen.' },
      ],
      DEFAULT_OFFERS.filter((offer) => offer.code !== 'C'),
    ),
    monthly: `${DEFAULT_OFFERS[2].name}, ${DEFAULT_OFFERS[2].price}: ${DEFAULT_OFFERS[2].text}`,
    say: [
      { lead: 'First WhatsApp:', text: 'introduce yourself; name three things patients see (a 2019 website that’s slow on phones, unanswered Google reviews, no word of the new wing); attach the health check; ask for 15 minutes this week to show a homepage design.' },
      { lead: 'Call opener:', text: '“I sent you a WhatsApp about Riverside Care’s website before the new wing opens. I’ve made a homepage design. Could I show it at the hospital in 15 minutes, Thursday or Friday?”' },
    ],
    donts: [
      { text: 'Don’t call the reviews bad; call them unanswered.', ok: false },
      { text: 'Don’t promise patient numbers or Google rankings.', ok: false },
      { text: 'Don’t publish the concept under their name; share screenshots or a private link.', ok: false },
      { text: 'Protect yourself: 50% advance, a fixed page list, two rounds of changes.', ok: true },
    ],
  };
  const onepager = {
    audience: 'patients',
    intro: 'Before visiting, most families now look a hospital up on their phone. These six things are what they find about Riverside Care Hospital today, and how each can be fixed.',
    issues: [
      { title: 'Your website is from 2019', text: 'riversidecare.example still shows the 2019 design and copyright line, with no layout for phones.', fix: 'a new bilingual, mobile-first site with one-tap call and WhatsApp buttons.' },
      { title: 'It’s slow on phones', text: 'Google PageSpeed scores it 31/100; the main content takes 7.8 seconds to appear.', fix: 'light pages and compressed photos, so it opens in about 2 seconds.' },
      { title: 'Reviews without replies', text: '4.1★ from 212 Google reviews, but only 3 of the 10 newest have a reply from the hospital.', fix: 'a reply to every review, and a simple routine to keep it up.' },
      { title: 'The new wing isn’t online', text: 'The 40-bed wing and dialysis unit opening in March 2027 appear in only one Facebook post.', fix: 'a launch page, Google posts and a pinned Facebook post.' },
      { title: 'No careers page', text: 'Nurse and front-desk vacancies go out only as Facebook posts.', fix: 'a careers page with a short apply form.' },
      { title: 'Two phone numbers', text: 'Google Maps, Facebook and the website don’t all show the same number.', fix: 'one 24×7 helpline with WhatsApp, everywhere.' },
    ],
    today: ['A 2019 website, slow on phones', 'Reviews without replies', 'New wing not announced', 'Contacts scattered'],
    after: ['A fast bilingual site with call buttons', 'Every review answered', 'A launch page for the new wing', 'One helpline everywhere'],
    nextStep: 'a 15-minute walkthrough of a new homepage design for Riverside Care Hospital, at the hospital, at a time that suits you.',
    leadDuration: DEFAULT_OFFERS[0].duration,
  };
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sample: true,
    createdAt: now,
    updatedAt: now,
    createdBy: { id: user?.id ?? null, name: user?.name ?? 'Admin' },
    status: 'ready',
    stage: 'ready',
    notBefore: null,
    waitReason: '',
    input,
    extra: { phones: [], emails: [], domains: [], links: [] },
    checks: {},
    plan: [],
    pool: [],
    sources: [{ id: 'S1', url: 'https://riversidecare.example/', title: 'Riverside Care Hospital (example)', host: 'riversidecare.example', via: 'website', match: { identity: 'strong', score: 10, hits: ['its own website'] } }],
    batches: [],
    batchIndex: 0,
    rawFacts: [],
    facts,
    documents: { summary, onepager, date, writtenAt: now },
    usage: { searches: 0, maps: 0, ai: 0, tokensIn: 0, tokensOut: 0, model: '' },
    tries: 0,
    log: [{ at: now, text: 'This is a made-up example, so you can see the review screen and both PDFs before adding keys.', kind: 'info' }],
    error: '',
  };
}
