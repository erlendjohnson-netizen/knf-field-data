// KNF Field Data: daily PDF reports by email (Supabase Edge Function "daily-reports").
//
// Every 15 minutes pg_cron calls this function with an empty body. For each day with an end-of-day bag check
// it waits 30 minutes after the last check is finished (so every crew phone has time to sync), then emails
// two PDFs to everyone whose "Email me the daily reports" switch is on:
//   1. Daily field summary (STPs, units and levels, bags, special finds, features, what is still open)
//   2. Bag check & box contents (missing bags by excavator, extra labels, what is in which box)
// If there is field activity but no bag check, the reports go out at 9 pm instead (saying no check was done).
// A later bag check on the same day sends an updated set. Test-mode data gets its own "[TEST]" reports.
//
// Signed-in staff can also call it from the app: { action: 'preview', date, mode } returns the PDFs,
// { action: 'send', date, mode, to: 'me' | 'all' } emails them now.
//
// Needs the secret RESEND_API_KEY (Supabase → Edge Functions → Secrets). Optional REPORT_FROM, e.g.
// "KNF Field Data <reports@your-domain.org>" once a domain is verified in Resend. Until then Resend only
// delivers to the address the Resend account was made with.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const TZ = 'America/Chicago';
const WAIT_MIN = 30, FALLBACK_HOUR = 21;
const DEFAULT_ON = ['PI / Co-PI', 'Field director / crew chief'];
const STAFF = ['PI / Co-PI', 'Project staff', 'Field director / crew chief', 'USFS staff'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
function serverKey(): string {
  try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); const v = k.default || Object.values(k)[0]; if (v) return String(v); } catch (_) { /* fall through */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

// ---------- dates in Louisiana time ----------
const dayOf = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso)) : '';
const timeOf = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '';
const hourNow = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date())) % 24;
const longDay = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d + 'T12:00:00Z'));
const shiftDay = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// ---------- loading records ----------
type Rec = { id: string; tbl: string; site_id: string | null; parent_id: string | null; data: any; created_at: string; updated_at: string; created_by: string | null };
const COLS = 'id,tbl,site_id,parent_id,data,created_at,updated_at,created_by';
async function page(q: () => any): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// everything the reports for one day need
async function loadDay(sb: any, table: string, day: string) {
  const lo = new Date(Date.parse(day + 'T00:00:00Z') - 864e5).toISOString(), hi = new Date(Date.parse(day + 'T00:00:00Z') + 2 * 864e5).toISOString();
  const recent = await page(() => sb.from(table).select(COLS).eq('deleted', false).gte('created_at', lo).lt('created_at', hi));
  const base = await page(() => sb.from(table).select(COLS).eq('deleted', false).in('tbl', ['sites', 'excavations', 'boxes', 'subunits']));
  const byId = new Map<string, Rec>();
  [...base, ...recent].forEach(r => byId.set(r.id, r));
  const all = [...byId.values()];
  const today = all.filter(r => dayOf(r.created_at) === day);
  const checks = all.filter(r => r.tbl === 'daychecks' && (r.data.date || dayOf(r.created_at)) === day);
  // bags scanned in today's checks may have been bagged earlier: fetch those bags and their levels
  const codes = [...new Set(checks.flatMap(c => (c.data.scanned || []).map((s: any) => s.code)))];
  const have = new Set(all.filter(r => r.tbl === 'bags').map(r => r.data.qr));
  const need = codes.filter(c => !have.has(c));
  for (let i = 0; i < need.length; i += 100) {
    const bags = await page(() => sb.from(table).select(COLS).eq('deleted', false).eq('tbl', 'bags').in('data->>qr', need.slice(i, i + 100)));
    bags.forEach(b => byId.set(b.id, b));
    const lv = [...new Set(bags.map(b => b.parent_id).filter(x => x && !byId.has(x)))] as string[];
    if (lv.length) (await page(() => sb.from(table).select(COLS).in('id', lv))).forEach(l => byId.set(l.id, l));
  }
  // what is in each box now: the latest custody event per item
  const boxes = [...new Set(checks.flatMap(c => (c.data.scanned || []).map((s: any) => s.box)).filter(Boolean))] as string[];
  const custody = boxes.length ? await page(() => sb.from(table).select(COLS).eq('deleted', false).eq('tbl', 'custody').in('data->>box_qr', boxes)) : [];
  const items = [...new Set(custody.map(c => c.data.item_qr))] as string[];
  const allEv: Rec[] = [];
  for (let i = 0; i < items.length; i += 100) allEv.push(...await page(() => sb.from(table).select(COLS).eq('deleted', false).eq('tbl', 'custody').in('data->>item_qr', items.slice(i, i + 100))));
  const latest = new Map<string, Rec>();
  allEv.forEach(e => { const k = e.data.item_qr, o = latest.get(k); if (!o || (e.data.time || e.created_at) > (o.data.time || o.created_at)) latest.set(k, e); });
  const boxNow: Record<string, string[]> = {};
  latest.forEach((e, code) => { if (e.data.action === 'Placed in box' && e.data.box_qr) (boxNow[e.data.box_qr] ||= []).push(code); });
  const recs = [...byId.values()];
  return { day, recs, byId, today, checks, boxNow };
}
type Day = Awaited<ReturnType<typeof loadDay>>;

// ---------- the report contents ----------
const isUnit = (e: any) => /unit|TP/i.test(e?.excavation_type || '') && !/STP/i.test(e?.excavation_type || '');
const n0 = (v: any) => Number(v) || 0;
const dash = (v: any) => (v === null || v === undefined || v === '') ? '-' : String(v);
function summary(D: Day) {
  const get = (id: string | null) => (id && D.byId.get(id)) || null;
  const siteName = (id: string | null) => { const s = get(id); return s ? (s.data.sitename || s.data.site_code || '?') : '?'; };
  const excName = (e: Rec | null) => e ? (e.data.excavation_name || e.data.excavationid || '?') : '?';
  const kids = (tbl: string, pid: string) => D.recs.filter(r => r.tbl === tbl && r.parent_id === pid);
  const levelsToday = D.today.filter(r => r.tbl === 'levels');
  const bagsToday = D.today.filter(r => r.tbl === 'bags');
  const featsToday = D.today.filter(r => r.tbl === 'features');
  const photosToday = D.today.filter(r => r.tbl === 'photos');
  const excIds = new Set<string>();
  D.recs.filter(r => r.tbl === 'excavations' && !r.data.planned && (r.data.date === D.day || dayOf(r.created_at) === D.day)).forEach(r => excIds.add(r.id));
  D.recs.filter(r => r.tbl === 'excavations' && r.data.planned && r.data._status !== 'planned' && dayOf(r.updated_at) === D.day).forEach(r => excIds.add(r.id));
  levelsToday.forEach(l => l.parent_id && excIds.add(l.parent_id));
  const excs = [...excIds].map(get).filter(Boolean) as Rec[];
  const stps = excs.filter(e => !isUnit(e.data)), units = excs.filter(e => isUnit(e.data));
  const sites = [...new Set([...excs.map(e => e.site_id), ...D.today.map(r => r.site_id)].filter(Boolean))] as string[];
  const people = [...new Set([...D.today.map(r => r.created_by), ...D.checks.map(c => c.data.checked_by)].filter(Boolean))] as string[];
  const times = D.today.map(r => r.created_at).sort();
  const districts = [...new Set(sites.map(s => get(s)?.data.district).filter(Boolean))];
  const parishes = [...new Set(sites.map(s => get(s)?.data.parish).filter(Boolean))];
  const bagsOf = (lv: Rec) => kids('bags', lv.id).map(b => b.data.qr).filter(Boolean).join(', ') || (lv.data.bag_qr || '-');
  const levelRows = levelsToday.filter(l => isUnit(get(l.parent_id)?.data)).sort((a, b) => (excName(get(a.parent_id)) + (a.data.excavation_unit || '') + String(a.data.levelno).padStart(3, '0')).localeCompare(excName(get(b.parent_id)) + (b.data.excavation_unit || '') + String(b.data.levelno).padStart(3, '0')))
    .map(l => { const e = get(l.parent_id); return [`${siteName(e?.site_id ?? null)} ${excName(e)}${l.data.excavation_unit || ''}`, dash(l.data.levelno), `${dash(l.data.top_cm)}-${dash(l.data.bgscm)}`,
      [l.data.munsell, l.data.soil_texture].filter(Boolean).join(' ') || (l.data.soil_change ? '' : 'same as above'), l.data.artifacts ? `${l.data.field_count ?? '?'}${l.data.special_find ? ' *SF*' : ''}` : 'none', bagsOf(l), dash(l.created_by)]; });
  const stpRows = stps.sort((a, b) => excName(a).localeCompare(excName(b), undefined, { numeric: true })).map(e => {
    const lv = kids('levels', e.id), cnt = lv.reduce((s, l) => s + n0(l.data.field_count), 0), sf = lv.some(l => l.data.special_find);
    const depth = e.data.depthcm ?? (lv.length ? Math.max(...lv.map(l => n0(l.data.bgscm))) : null);
    const result = e.data.not_excavated_reason ? `not dug: ${e.data.not_excavated_reason}` : e.data.positive || cnt > 0 ? 'positive' : lv.length || e.data._status === 'complete' ? 'negative' : 'in progress';
    const bags = lv.flatMap(l => kids('bags', l.id).map(b => b.data.qr)).filter(Boolean).join(', ') || '-';
    return [excName(e), siteName(e.site_id), dash(depth), result, cnt ? `${cnt}${sf ? ' *SF*' : ''}` : '-', bags, dash(e.data.crew || e.created_by)];
  });
  const sfRows = levelsToday.filter(l => l.data.special_find).map(l => { const e = get(l.parent_id); return [`${siteName(e?.site_id ?? null)} ${excName(e)} ${l.data.excavation_unit || ''} L${dash(l.data.levelno)} (${dash(l.data.top_cm)}-${dash(l.data.bgscm)} cm)`, dash(l.data.special_find_desc), bagsOf(l), photosToday.some(p => p.parent_id === l.id && /special|in situ/i.test(p.data.kind || '')) ? 'yes' : 'no']; });
  const featRows = featsToday.map(f => { const e = get(f.parent_id); const ph = photosToday.filter(p => p.parent_id === f.id).map(p => p.data.kind).filter(Boolean);
    return [`Fea. ${dash(f.data.featurnumbersite)}`, `${siteName(e?.site_id ?? null)} ${excName(e)}${f.data.excavation_unit || ''}${f.data.levelno != null && f.data.levelno !== '' ? ' L' + f.data.levelno : ''}`, f.data.feature_type === 'Other' ? dash(f.data.feature_type_other) : dash(f.data.feature_type), dash(f.data.munsell), dash(f.data.description), ph.length ? [...new Set(ph)].join(', ') : 'none']; });
  const open: string[] = [];
  units.filter(u => u.data._status !== 'complete').forEach(u => open.push(`${siteName(u.site_id)} ${excName(u)} still open (deepest level ${Math.max(0, ...kids('levels', u.id).map(l => n0(l.data.bgscm)))} cmbs)`));
  stps.filter(s => s.data._status === 'open').forEach(s => open.push(`${siteName(s.site_id)} ${excName(s)} not finished`));
  sites.forEach(s => { const left = D.recs.filter(r => r.tbl === 'excavations' && r.site_id === s && r.data.planned && r.data._status === 'planned').length; if (left) open.push(`${siteName(s)}: ${left} planned STP${left > 1 ? 's' : ''} not dug yet`); });
  D.checks.forEach(c => (c.data.missing || []).forEach((m: any) => open.push(`Missing bag ${m.code} (${m.by || '?'}): ${m.site} ${m.exc} ${m.level}`)));
  const notes = D.checks.map(c => c.data.notes).filter(Boolean);
  return { sites: sites.map(siteName), districts, parishes, people, hours: times.length ? `${timeOf(times[0])} - ${timeOf(times[times.length - 1])}` : '-',
    counts: [stps.length + (stps.length ? ` (${stpRows.filter(r => r[3] === 'positive').length} positive)` : ''), String(units.length), String(levelsToday.length), String(bagsToday.length), String(sfRows.length), String(featRows.length), String(photosToday.length)],
    levelRows, stpRows, sfRows, featRows, open, notes, active: D.today.length > 0 };
}
function bagInfo(D: Day, code: string) {
  const b = D.recs.find(r => r.tbl === 'bags' && r.data.qr === code); if (!b) return null;
  const lv = b.parent_id ? D.byId.get(b.parent_id) : null, ex = lv?.parent_id ? D.byId.get(lv.parent_id) : null, s = b.site_id ? D.byId.get(b.site_id) : null;
  return `${s?.data.sitename || '?'} ${ex ? (ex.data.excavation_name || '') : ''} ${lv ? `${lv.data.excavation_unit || ''} L${lv.data.levelno ?? '?'} (${lv.data.top_cm ?? '?'}-${lv.data.bgscm ?? '?'})` : ''}${b.data.contents ? ' · ' + b.data.contents : ''}`.replace(/\s+/g, ' ').trim();
}

// ---------- a small PDF table writer (letter size) ----------
const GREEN = rgb(0.184, 0.29, 0.165), LIGHT = rgb(0.933, 0.949, 0.918), GRID = rgb(0.67, 0.71, 0.65), RED = rgb(0.69, 0.19, 0.19), GREY = rgb(0.4, 0.4, 0.4);
const EXTRA = '–—‘’“”•…€™‚„†‡ˆ‰Š‹ŒŽ˜šœžŸ';
const clean = (s: any) => String(s ?? '').replace(/→/g, '->').replace(/✓/g, 'OK').replace(/[⚠]/g, '!').replace(/[^\n\x20-\x7e\xa0-\xff]/g, ch => EXTRA.includes(ch) ? ch : '?');
async function newPdf(title: string, mode: string, made: string) {
  const doc = await PDFDocument.create(); doc.setTitle(title); doc.setAuthor('KNF Field Data app');
  const F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 43, BOT = 50;
  let pg = doc.addPage([W, H]), y = H - 40;
  const lines = (t: string, f: any, sz: number, w: number) => {
    const out: string[] = [];
    clean(t).split('\n').forEach(par => { let cur = ''; par.split(/\s+/).forEach(word => {
      let wd = word; while (f.widthOfTextAtSize(wd, sz) > w && wd.length > 1) { let k = wd.length - 1; while (k > 1 && f.widthOfTextAtSize(wd.slice(0, k), sz) > w) k--; if (cur) { out.push(cur); cur = ''; } out.push(wd.slice(0, k)); wd = wd.slice(k); }
      const tryS = cur ? cur + ' ' + wd : wd; if (f.widthOfTextAtSize(tryS, sz) <= w) cur = tryS; else { if (cur) out.push(cur); cur = wd; } }); out.push(cur); });
    return out;
  };
  const room = (h: number) => { if (y - h < BOT) { pg = doc.addPage([W, H]); y = H - 40; return true; } return false; };
  const text = (t: string, o: { sz?: number; bold?: boolean; color?: any; gap?: number } = {}) => {
    const sz = o.sz || 9, f = o.bold ? FB : F, L = lines(t, f, sz, W - 2 * M);
    L.forEach(l => { room(sz * 1.35); pg.drawText(l, { x: M, y: y - sz, size: sz, font: f, color: o.color || rgb(0, 0, 0) }); y -= sz * 1.35; });
    y -= o.gap ?? 2;
  };
  const h1 = (t: string) => { room(60); text(t, { sz: 16, bold: true, gap: 2 }); if (mode === 'test') text('TEST MODE DATA', { sz: 9, bold: true, color: RED, gap: 4 }); };
  const h2 = (t: string) => { room(75); y -= 6; text(t, { sz: 11.5, bold: true, color: GREEN, gap: 3 }); };
  const table = (head: string[], rows: string[][], widths: number[], hl: Record<number, any> = {}) => {
    const tot = widths.reduce((a, b) => a + b, 0), cw = widths.map(w => w / tot * (W - 2 * M)), sz = 8.3, lh = sz * 1.3, pad = 3;
    const rowH = (cells: string[], f: any) => Math.max(...cells.map((c, i) => lines(c, f, sz, cw[i] - 2 * pad).length)) * lh + 2 * pad;
    const draw = (cells: string[], header: boolean, bg: any) => {
      const f = header ? FB : F, h = rowH(cells, f);
      let x = M; pg.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: bg });
      cells.forEach((c, i) => { pg.drawRectangle({ x, y: y - h, width: cw[i], height: h, borderColor: GRID, borderWidth: 0.4 });
        lines(c, f, sz, cw[i] - 2 * pad).forEach((l, k) => pg.drawText(l, { x: x + pad, y: y - pad - sz - k * lh + 1, size: sz, font: f, color: header ? rgb(1, 1, 1) : rgb(0, 0, 0) })); x += cw[i]; });
      y -= h;
    };
    room(rowH(head, FB) + (rows[0] ? rowH(rows[0], F) : 0)); draw(head, true, GREEN);
    rows.forEach((r, i) => { if (room(rowH(r, F))) draw(head, true, GREEN); draw(r, false, hl[i] || (i % 2 ? LIGHT : rgb(1, 1, 1))); });
    y -= 4;
  };
  const info = (pairs: [string, string][]) => table(pairs.filter((_, i) => i % 2 === 0).map(p => p[0]), [pairs.filter((_, i) => i % 2 === 0).map(p => p[1])], pairs.filter((_, i) => i % 2 === 0).map(() => 1));
  const finish = async () => {
    const pages = doc.getPages();
    pages.forEach((p, i) => { p.drawText(clean(`KNF Phase II field data app${mode === 'test' ? ' · TEST MODE' : ''} · made ${made}`), { x: M, y: 30, size: 7.5, font: F, color: GREY });
      const s = `Page ${i + 1} of ${pages.length}`; p.drawText(s, { x: W - M - F.widthOfTextAtSize(s, 7.5), y: 30, size: 7.5, font: F, color: GREY }); });
    return await doc.save();
  };
  // reserve h points of the page and draw on it: fn(page, left x, top y)
  const block = (h: number, fn: (p: any, x: number, top: number) => void) => { room(h); fn(pg, M, y); y -= h; };
  // photos two to a row
  let col = 0, rowH = 0;
  const photo = async (bytes: Uint8Array, caption: string) => {
    let img: any; try { img = await doc.embedJpg(bytes); } catch (_) { try { img = await doc.embedPng(bytes); } catch (_) { return false; } }
    const bw = (W - 2 * M - 12) / 2, bh = 200, sc = Math.min(bw / img.width, bh / img.height), w = img.width * sc, h = img.height * sc;
    if (col === 0) { room(bh + 30); rowH = 0; }
    const x = M + col * (bw + 12);
    pg.drawImage(img, { x: x + (bw - w) / 2, y: y - h, width: w, height: h });
    lines(caption, F, 7.5, bw).slice(0, 3).forEach((l, k) => pg.drawText(l, { x, y: y - h - 10 - k * 9, size: 7.5, font: F, color: GREY }));
    rowH = Math.max(rowH, h + 14 + 9 * Math.min(3, lines(caption, F, 7.5, bw).length));
    if (++col === 2) { col = 0; y -= rowH + 8; }
    return true;
  };
  const endPhotos = () => { if (col) { col = 0; y -= rowH + 8; } };
  return { text, h1, h2, table, info, finish, block, photo, endPhotos, F, FB, W, M, RED };
}

// plan of each unit worked today: subunits opened today and subunits dug today are highlighted
const NEW = rgb(0.96, 0.62, 0.2), DUG = rgb(0.42, 0.68, 0.36), BOTH = rgb(0.85, 0.75, 0.25), OLD = rgb(0.9, 0.9, 0.9);
function unitPlans(D: Day, P: any) {
  const get = (id: string | null) => (id && D.byId.get(id)) || null;
  const lvToday = D.today.filter(r => r.tbl === 'levels');
  const unitIds = new Set<string>();
  lvToday.forEach(l => { const e = get(l.parent_id); if (e && isUnit(e.data)) unitIds.add(e.id); });
  D.today.filter(r => r.tbl === 'subunits').forEach(s => s.parent_id && unitIds.add(s.parent_id));
  const units = [...unitIds].map(get).filter(Boolean) as Rec[];
  if (!units.length) return;
  P.h2('Unit plans');
  P.text('Orange = subunit opened today · green = subunit excavated today (levels shown) · yellow = both · grey = earlier. Unit grid, north up, datum marked.', { sz: 7.5, gap: 4 });
  units.forEach(u => {
    const subs = D.recs.filter(r => r.tbl === 'subunits' && r.parent_id === u.id);
    const parts = subs.flatMap(s => (Array.isArray(s.data.parts) ? s.data.parts : []).map((p: any) => ({ ...p, s })));
    if (!parts.length) return;
    const x0 = Math.min(0, ...parts.map((p: any) => +p.x)), y0 = Math.min(0, ...parts.map((p: any) => +p.y)), x1 = Math.max(...parts.map((p: any) => +p.x + +p.w)), y1 = Math.max(...parts.map((p: any) => +p.y + +p.h));
    const maxW = 300, maxH = 200, sc = Math.min(maxW / (x1 - x0), maxH / (y1 - y0), 80), h = (y1 - y0) * sc + 46;
    const site = get(u.site_id)?.data.sitename || '?';
    P.block(h + 6, (pg: any, L: number, top: number) => {
      pg.drawText(clean(`${site} ${u.data.excavation_name || ''} (${subs.length} subunit${subs.length === 1 ? '' : 's'})`), { x: L, y: top - 10, size: 9, font: P.FB });
      const ox = L + 10, oy = top - 22 - (y1 - y0) * sc, X = (m: number) => ox + (m - x0) * sc, Y = (m: number) => oy + (m - y0) * sc;
      parts.forEach((p: any) => {
        const s = p.s, letter = String(s.data.letter || '').toUpperCase();
        const isNew = s.data.opened === D.day || dayOf(s.created_at) === D.day;
        const lv = lvToday.filter(l => l.parent_id === u.id && String(l.data.excavation_unit || '').toUpperCase() === letter);
        const col = isNew && lv.length ? BOTH : isNew ? NEW : lv.length ? DUG : OLD;
        pg.drawRectangle({ x: X(+p.x), y: Y(+p.y), width: +p.w * sc, height: +p.h * sc, color: col, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.8 });
      });
      subs.forEach(s => { const ps = Array.isArray(s.data.parts) ? s.data.parts : []; if (!ps.length) return; const p = ps[0], letter = String(s.data.letter || '').toUpperCase();
        const lv = lvToday.filter(l => l.parent_id === u.id && String(l.data.excavation_unit || '').toUpperCase() === letter).map(l => +l.data.levelno).sort((a, b) => a - b);
        const cx = X(+p.x + +p.w / 2), cy = Y(+p.y + +p.h / 2);
        pg.drawText(letter, { x: cx - P.FB.widthOfTextAtSize(letter, 11) / 2, y: cy - 2, size: 11, font: P.FB });
        if (lv.length) { const t = `L${lv[0]}${lv.length > 1 ? '-' + lv[lv.length - 1] : ''}`; pg.drawText(t, { x: cx - P.F.widthOfTextAtSize(t, 7.5) / 2, y: cy - 12, size: 7.5, font: P.F }); } });
      pg.drawCircle({ x: X(0), y: Y(0), size: 3, color: rgb(0.7, 0.1, 0.1) });
      pg.drawText('datum', { x: X(0) + 4, y: Y(0) - 9, size: 6.5, font: P.F, color: rgb(0.7, 0.1, 0.1) });
      const ax = X(x1) + 22, ay = Y(y1) - 2; pg.drawLine({ start: { x: ax, y: ay - 22 }, end: { x: ax, y: ay }, thickness: 1 }); pg.drawText('N', { x: ax - 3, y: ay + 3, size: 8, font: P.FB });
      const sb = X(x0), sy = oy - 22; pg.drawLine({ start: { x: sb, y: sy }, end: { x: sb + sc, y: sy }, thickness: 1.2 }); pg.drawText('1 m', { x: sb + sc + 4, y: sy - 3, size: 7, font: P.F });
    });
  });
}
// photos of today's special finds and features (from the photos bucket)
async function findPhotos(sb: any, D: Day, P: any, mode: string) {
  const get = (id: string | null) => (id && D.byId.get(id)) || null;
  const targets = new Map<string, string>();
  D.today.filter(r => r.tbl === 'levels' && r.data.special_find).forEach(l => { const e = get(l.parent_id); targets.set(l.id, `Special find · ${get(e?.site_id ?? null)?.data.sitename || ''} ${e?.data.excavation_name || ''} ${l.data.excavation_unit || ''} L${l.data.levelno ?? '?'}`); });
  D.today.filter(r => r.tbl === 'features').forEach(f => { const e = get(f.parent_id); targets.set(f.id, `Feature ${f.data.featurnumbersite ?? '?'} · ${get(e?.site_id ?? null)?.data.sitename || ''} ${e?.data.excavation_name || ''}`); });
  const photos = D.recs.filter(r => r.tbl === 'photos' && r.parent_id && targets.has(r.parent_id) && r.data.path)
    .filter(p => !(D.byId.get(p.parent_id!)?.tbl === 'levels') || /special|in situ/i.test(p.data.kind || ''));
  if (!photos.length) return;
  P.h2('Photos: special finds & features');
  let missing = 0, shown = 0;
  for (const p of photos.slice(0, 24)) {
    const { data } = await sb.storage.from('photos').download((mode === 'test' ? 'test/' : '') + p.data.path);
    if (!data) { missing++; continue; }
    const ok = await P.photo(new Uint8Array(await data.arrayBuffer()), `${targets.get(p.parent_id!)} · ${p.data.kind || 'Photo'}${p.data.caption ? ' · ' + p.data.caption : ''}`);
    if (ok) shown++; else missing++;
  }
  P.endPhotos();
  if (missing) P.text(`${missing} photo${missing > 1 ? 's' : ''} not uploaded yet (the phone has not synced its photos).`, { sz: 7.5 });
  if (photos.length > 24) P.text(`${photos.length - 24} more photos are in the app.`, { sz: 7.5 });
}

async function summaryPdf(D: Day, mode: string, sb: any) {
  const S = summary(D), made = `${longDay(dayOf(new Date().toISOString()))} ${timeOf(new Date().toISOString())}`;
  const P = await newPdf(`KNF daily field summary ${D.day}`, mode, made);
  P.h1('KNF Phase II - Daily Field Summary');
  P.info([['Date', longDay(D.day)], ['', ''], ['District', S.districts.join(', ') || '-'], ['', ''], ['Parish', S.parishes.join(', ') || '-'], ['', ''], ['First - last record', S.hours], ['', '']]);
  P.text(`Sites / areas worked: ${S.sites.join(', ') || '-'}`, { gap: 1 });
  P.text(`Recorded by: ${S.people.join(', ') || '-'}`, { gap: 4 });
  P.h2('Day at a glance');
  P.table(['STPs dug', 'Units worked', 'Levels recorded', 'Bags', 'Special finds', 'Features', 'Photos'], [S.counts], [1, 1, 1, 1, 1, 1, 1]);
  if (S.notes.length) { P.h2('Notes'); S.notes.forEach(n => P.text(n)); }
  P.h2('Units & levels');
  if (S.levelRows.length) P.table(['Unit / EU', 'Level', 'Depth (cmbs)', 'Soil', 'Field count', 'Bag', 'Recorded by'], S.levelRows, [1.3, 0.45, 0.7, 1.4, 0.7, 1.1, 0.9]); else P.text('No unit levels recorded.');
  unitPlans(D, P);
  P.h2('STPs');
  if (S.stpRows.length) P.table(['STP', 'Site / area', 'Depth', 'Result', 'Field count', 'Bags', 'Excavator'], S.stpRows, [0.9, 0.9, 0.5, 1.3, 0.65, 1.2, 0.9]); else P.text('No STPs recorded.');
  P.h2('Special finds');
  if (S.sfRows.length) P.table(['Provenience', 'Description', 'Bag', 'Photo'], S.sfRows, [1.8, 3, 1, 0.5]); else P.text('None.');
  P.h2('Features');
  if (S.featRows.length) P.table(['Feature', 'Unit / level', 'Type', 'Munsell', 'Description', 'Photos'], S.featRows, [0.6, 1.4, 0.9, 0.9, 1.8, 1]); else P.text('None.');
  await findPhotos(sb, D, P, mode);
  P.h2('Still open');
  if (S.open.length) S.open.forEach(o => P.text('• ' + o, { gap: 1 })); else P.text('Nothing left open.');
  P.text('Records still saved as drafts on a phone are not on the server and are not in this report.', { sz: 7.5, color: GREY, gap: 0 });
  return { pdf: await P.finish(), S };
}

async function bagPdf(D: Day, mode: string) {
  const made = `${longDay(dayOf(new Date().toISOString()))} ${timeOf(new Date().toISOString())}`;
  const P = await newPdf(`KNF bag check ${D.day}`, mode, made);
  P.h1('End-of-Day Bag Check & Box Contents');
  if (!D.checks.length) { P.text(`No end-of-day bag check was done on ${longDay(D.day)}.`, { sz: 10, bold: true, color: P.RED }); return await P.finish(); }
  D.checks.sort((a, b) => (a.data.finished || a.created_at).localeCompare(b.data.finished || b.created_at)).forEach((c, ci) => {
    const d = c.data;
    if (D.checks.length > 1) P.h2(`Check ${ci + 1} of ${D.checks.length}`);
    P.info([['Date', longDay(D.day)], ['', ''], ['Checked by', dash(d.checked_by)], ['', ''], ['Scan time', `${timeOf(d.started || c.created_at)} - ${timeOf(d.finished || c.created_at)}`], ['', ''], ['Result', d.missing_n || d.extra_n ? `${n0(d.missing_n)} missing, ${n0(d.extra_n)} extra` : 'All bags accounted for'], ['', '']]);
    P.text(`Sites: ${dash(d.sites)}   ·   Boxes: ${dash(d.boxes)}`, { gap: 4 });
    P.table(['Expected', 'Scanned', 'Missing', 'Extra labels'], [[dash(d.expected_n), dash(d.scanned_n), dash(d.missing_n), dash(d.extra_n)]], [1, 1, 1, 1]);
    P.h2('Missing bags - by who bagged them');
    const miss = [...(d.missing || [])].sort((a: any, b: any) => String(a.by).localeCompare(String(b.by)));
    if (miss.length) P.table(['Bagged by', 'Bag', 'Provenience', 'Contents', 'Bagged'], miss.map((m: any) => [dash(m.by), dash(m.code), `${m.site || ''} ${m.exc || ''} ${m.level || ''} ${m.depth ? '(' + m.depth + ')' : ''}`, dash(m.contents), dash(m.date)]), [1, 0.9, 2.2, 1, 0.8], Object.fromEntries(miss.map((_: any, i: number) => [i, rgb(0.965, 0.863, 0.863)])));
    else P.text('No bags missing.');
    P.h2('Extra labels - scanned but not expected');
    if ((d.extras || []).length) P.table(['Label', 'Box', 'Why'], d.extras.map((x: any) => [dash(x.code), dash(x.box), dash(x.why)]), [0.9, 0.9, 4], Object.fromEntries(d.extras.map((_: any, i: number) => [i, rgb(0.984, 0.937, 0.816)])));
    else P.text('No extra labels.');
    if (d.notes) { P.h2('Notes'); P.text(d.notes); }
  });
  P.h2('Box contents');
  const scannedToday = new Set(D.checks.flatMap(c => (c.data.scanned || []).map((s: any) => s.code)));
  const boxes = [...new Set(D.checks.flatMap(c => (c.data.scanned || []).map((s: any) => s.box)).filter(Boolean))] as string[];
  boxes.forEach(bx => {
    const now = (D.boxNow[bx] || []).sort(), loc = D.recs.find(r => r.tbl === 'boxes' && r.data.qr === bx);
    P.text(`Box ${bx}${loc?.data.box_no ? ' (no. ' + loc.data.box_no + ')' : ''} · ${now.length} bag${now.length === 1 ? '' : 's'} in it now${loc?.data.location ? ' · ' + loc.data.location : ''}`, { bold: true, gap: 2 });
    if (now.length) P.table(['Bag', 'Provenience', 'Scanned today'], now.map(code => [code, bagInfo(D, code) || '(not linked to a level)', scannedToday.has(code) ? 'yes' : 'earlier']), [0.9, 4, 0.8]);
  });
  P.text('Box contents come from the custody log: each bag counts in the last box it was scanned into.', { sz: 7.5, color: GREY, gap: 0 });
  return await P.finish();
}

// ---------- email ----------
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function sendMail(to: string, subject: string, html: string, files: { name: string; pdf: Uint8Array }[]) {
  const key = Deno.env.get('RESEND_API_KEY'); if (!key) throw new Error('RESEND_API_KEY is not set in the Edge Function secrets');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('REPORT_FROM') || 'KNF Field Data <onboarding@resend.dev>', to: [to], subject, html, attachments: files.map(f => ({ filename: f.name, content: b64(f.pdf) })) }) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function recipients(sb: any) {
  const { data, error } = await sb.from('profiles').select('email,name,role,disabled,email_reports');
  if (error) throw new Error(error.message);
  return (data || []).filter((p: any) => !p.disabled && p.email && (p.email_reports ?? DEFAULT_ON.includes(p.role)));
}
async function build(sb: any, day: string, mode: string) {
  const D = await loadDay(sb, mode === 'test' ? 'records_test' : 'records', day);
  const { pdf: sum, S } = await summaryPdf(D, mode, sb), bag = await bagPdf(D, mode);
  const tag = mode === 'test' ? '_TEST' : '';
  return { D, S, files: [{ name: `KNF_daily_summary_${day}${tag}.pdf`, pdf: sum }, { name: `KNF_bag_check_${day}${tag}.pdf`, pdf: bag }] };
}
async function deliver(sb: any, day: string, mode: string, to: { email: string; name?: string }[]) {
  const { D, S, files } = await build(sb, day, mode);
  const miss = D.checks.reduce((s, c) => s + n0(c.data.missing_n), 0), extra = D.checks.reduce((s, c) => s + n0(c.data.extra_n), 0);
  const subject = `${mode === 'test' ? '[TEST] ' : ''}KNF daily report ${day}${D.checks.length ? ` · ${miss ? miss + ' bag' + (miss > 1 ? 's' : '') + ' missing' : 'all bags checked'}` : ' · no bag check'}`;
  const html = `<p>KNF Phase II field reports for <b>${longDay(day)}</b>${mode === 'test' ? ' (<b>test mode data</b>)' : ''}.</p>
    <p>Sites / areas: ${clean(S.sites.join(', ') || '-')}<br>STPs ${S.counts[0]} · units ${S.counts[1]} · levels ${S.counts[2]} · bags ${S.counts[3]} · special finds ${S.counts[4]} · features ${S.counts[5]}<br>
    Bag check: ${D.checks.length ? `${miss} missing, ${extra} extra` : '<b>not done</b>'}</p>
    <p>Two PDFs attached: the daily summary, and the bag check with box contents.</p>
    <p style="color:#777;font-size:12px">You get these because "Email me the daily reports" is on for you in the KNF Field Data app (Settings). Switch it off there to stop them.</p>`;
  const sent: string[] = [], failed: string[] = [];
  for (const p of to) { try { await sendMail(p.email, subject, html, files); sent.push(p.email); } catch (e) { failed.push(`${p.email}: ${(e as Error).message}`); } }
  return { sent, failed, checks: D.checks.length };
}

// which days are due (cron)
async function due(sb: any, mode: string) {
  const table = mode === 'test' ? 'records_test' : 'records', since = new Date(Date.now() - 3 * 864e5).toISOString(), today = dayOf(new Date().toISOString());
  const checks = await page(() => sb.from(table).select('id,data,created_at').eq('deleted', false).eq('tbl', 'daychecks').gte('created_at', since));
  const { data: log } = await sb.from('report_log').select('day,checks_n').eq('mode', mode).gte('day', shiftDay(today, -4));
  const sentN = new Map((log || []).map((l: any) => [l.day, l.checks_n]));
  const byDay = new Map<string, { n: number; last: string }>();
  checks.forEach((c: any) => { const d = c.data.date || dayOf(c.created_at), f = c.data.finished || c.created_at, o = byDay.get(d) || { n: 0, last: '' }; byDay.set(d, { n: o.n + 1, last: f > o.last ? f : o.last }); });
  const out: { day: string; n: number }[] = [];
  byDay.forEach((v, d) => { if (Date.now() - Date.parse(v.last) >= WAIT_MIN * 6e4 && !(sentN.has(d) && (sentN.get(d) as number) >= v.n)) out.push({ day: d, n: v.n }); });
  // field work but no bag check by 9 pm
  if (!byDay.has(today) && !sentN.has(today) && hourNow() >= FALLBACK_HOUR) {
    const start = new Date(Date.parse(today + 'T05:00:00Z')).toISOString();
    const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('deleted', false).in('tbl', ['excavations', 'levels', 'bags', 'features']).gte('created_at', start);
    if (count) out.push({ day: today, n: 0 });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({}));
    if (!b.action) {
      // scheduled run: send whatever is due, to everyone who has the reports switched on
      const to = await recipients(sb), done: unknown[] = [];
      for (const mode of ['live', 'test']) for (const d of await due(sb, mode)) {
        const r = to.length ? await deliver(sb, d.day, mode, to) : { sent: [], failed: ['nobody has the reports switched on'], checks: d.n };
        await sb.from('report_log').upsert({ day: d.day, mode, checks_n: d.n, sent_at: new Date().toISOString(), sent_to: r.sent.join(', '), failed: r.failed.join('; ') || null });
        done.push({ day: d.day, mode, sent: r.sent.length, failed: r.failed.length });
      }
      return reply({ ok: true, done });
    }
    // from the app: staff only
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = await sb.auth.getUser(jwt);
    if (!who?.user) return reply({ error: 'Not signed in' }, 401);
    const { data: me } = await sb.from('profiles').select('email,name,role,disabled').eq('id', who.user.id).single();
    if (!me || me.disabled || !STAFF.includes(me.role)) return reply({ error: 'Only staff can make the daily reports' }, 403);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : dayOf(new Date().toISOString()), mode = b.mode === 'test' ? 'test' : 'live';
    if (b.action === 'preview') {
      const { files } = await build(sb, day, mode);
      return reply({ ok: true, files: files.map(f => ({ name: f.name, base64: b64(f.pdf) })) });
    }
    if (b.action === 'send') {
      const to = b.to === 'all' ? await recipients(sb) : [{ email: me.email || who.user.email, name: me.name }];
      if (!to.length) return reply({ error: 'Nobody has the daily reports switched on' }, 400);
      const r = await deliver(sb, day, mode, to);
      if (!r.sent.length) return reply({ error: 'Not sent: ' + r.failed.join('; ') }, 500);
      return reply({ ok: true, ...r });
    }
    return reply({ error: 'Unknown action' }, 400);
  } catch (e) {
    return reply({ error: (e as Error).message }, 500);
  }
});
