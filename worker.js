/**
 * 小嘟衣櫥 — Cloudflare Worker（Notion 中介小管理員）
 *
 * 作用：手機網頁不能直接連 Notion（金鑰會外洩、而且 Notion 會擋），
 *       所以網頁先把資料交給這個 Worker，再由它帶著金鑰去存取 Notion。
 *
 * 在 Cloudflare 需要設定兩個「Secret（加密變數）」：
 *   NOTION_TOKEN  = Notion integration 的金鑰（ntn_ 開頭）
 *   APP_PASSWORD  = 你自己想一組密碼（網頁設定頁要填一樣的）
 * 選填：
 *   DATABASE_ID   = Notion 資料庫 ID（不填的話，由網頁設定頁提供）
 */

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ---- 欄位名稱（Notion 資料庫裡看到的名字）----
const P = {
  name: '名稱',
  photos: '照片',
  category: '類別',
  brand: '品牌',
  size: '尺寸',
  season: '季節',
  price: '購買價格',
  status: '去向',
  condition: '新舊程度',
  askPrice: '預計售價',
  soldPrice: '售出金額',
  note: '備註',
  buyDate: '購買日期',
  fit: '版型',
  created: '建立時間',
};
const FIT_OPTIONS = ['偏小', '正常', '偏大'];

const opt = (names, color = 'default') => ({
  options: names.map((n) => ({ name: n, color })),
});

// 建立資料庫時用的欄位設定
const SCHEMA = {
  [P.name]: { title: {} },
  [P.photos]: { files: {} },
  [P.category]: { select: opt(['洋裝', '上衣', '裙子', '褲子', '連身', '配件', '背心外套', '其他'], 'brown') },
  [P.brand]: { select: { options: [] } },
  [P.size]: { select: opt(['70', '80', '90', 'SS', 'S', 'M', 'L', '18m', '24m'], 'gray') },
  [P.season]: {
    select: {
      options: [
        { name: '春夏', color: 'green' },
        { name: '秋冬', color: 'orange' },
        { name: '四季', color: 'default' },
      ],
    },
  },
  [P.price]: { number: { format: 'number' } },
  [P.status]: {
    select: {
      options: [
        { name: '未來穿', color: 'green' },
        { name: '現在穿', color: 'blue' },
        { name: '穿不下', color: 'gray' },
        { name: '待整理', color: 'yellow' },
        { name: '待出售', color: 'orange' },
        { name: '已售出', color: 'brown' },
        { name: '贈與', color: 'pink' },
        { name: '淘汰', color: 'default' },
      ],
    },
  },
  [P.condition]: { select: opt(['全新', '全新無吊牌', '九成新', '八成新', '七成新', '有小瑕疵', '有污漬'], 'purple') },
  [P.askPrice]: { number: { format: 'number' } },
  [P.soldPrice]: { number: { format: 'number' } },
  [P.note]: { rich_text: {} },
  [P.buyDate]: { date: {} },
  [P.fit]: { select: opt(FIT_OPTIONS, 'blue') },
  [P.created]: { created_time: {} },
};

// ---------- 小工具 ----------
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-App-Key,X-Db-Id',
  'Access-Control-Max-Age': '86400',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function notion(env, path, method = 'GET', body) {
  const res = await fetch(NOTION + path, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.message || `Notion 錯誤 ${res.status}`;
    if (res.status === 401) msg = 'Notion 金鑰（NOTION_TOKEN）不正確';
    if (res.status === 404) msg = '找不到 Notion 頁面或資料庫：請確認已把它「連結」給你的 integration';
    throw new HttpError(res.status, msg);
  }
  return data;
}

const plain = (arr) => (arr || []).map((t) => t.plain_text || '').join('');
const text = (s) => (s ? [{ type: 'text', text: { content: String(s).slice(0, 2000) } }] : []);
const sel = (v) => (v ? { select: { name: String(v).replace(/,/g, '，').slice(0, 100) } } : { select: null });
const num = (v) => ({ number: v === '' || v == null || isNaN(Number(v)) ? null : Number(v) });

function pageToItem(page) {
  const p = page.properties || {};
  const s = (k) => (p[k] && p[k].select ? p[k].select.name : '');
  const n = (k) => (p[k] && typeof p[k].number === 'number' ? p[k].number : null);
  return {
    id: page.id,
    name: plain(p[P.name] && p[P.name].title),
    photos: ((p[P.photos] && p[P.photos].files) || [])
      .map((f) => (f.external ? f.external.url : f.file ? f.file.url : ''))
      .filter(Boolean),
    category: s(P.category),
    brand: p[P.brand] ? (p[P.brand].select ? p[P.brand].select.name : plain(p[P.brand].rich_text)) : '',
    size: s(P.size),
    season: s(P.season),
    price: n(P.price),
    status: s(P.status),
    condition: s(P.condition),
    askPrice: n(P.askPrice),
    soldPrice: n(P.soldPrice),
    note: plain(p[P.note] && p[P.note].rich_text),
    buyDate: (p[P.buyDate] && p[P.buyDate].date && p[P.buyDate].date.start) || '',
    fit: s(P.fit),
    created: (p[P.created] && p[P.created].created_time) || page.created_time,
    edited: page.last_edited_time,
  };
}

function itemToProps(it, brandType = 'select') {
  const props = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(it, k);
  if (has('name')) props[P.name] = { title: text(it.name) };
  if (has('photos'))
    props[P.photos] = {
      files: (it.photos || []).slice(0, 6).map((url, i) => ({
        name: i === 0 ? '主圖' : `副圖${i}`,
        type: 'external',
        external: { url },
      })),
    };
  if (has('category')) props[P.category] = sel(it.category);
  if (has('brand')) props[P.brand] = brandType === 'select' ? sel(it.brand) : { rich_text: text(it.brand) };
  if (has('size')) props[P.size] = sel(it.size);
  if (has('season')) props[P.season] = sel(it.season);
  if (has('price')) props[P.price] = num(it.price);
  if (has('status')) props[P.status] = sel(it.status);
  if (has('condition')) props[P.condition] = sel(it.condition);
  if (has('askPrice')) props[P.askPrice] = num(it.askPrice);
  if (has('soldPrice')) props[P.soldPrice] = num(it.soldPrice);
  if (has('note')) props[P.note] = { rich_text: text(it.note) };
  if (has('buyDate')) props[P.buyDate] = { date: it.buyDate ? { start: String(it.buyDate).slice(0, 10) } : null };
  if (has('fit')) props[P.fit] = sel(it.fit);
  return props;
}

const imageBlock = (url) => ({
  object: 'block',
  type: 'image',
  image: { type: 'external', external: { url } },
});
const cover = (photos) =>
  photos && photos[0] ? { type: 'external', external: { url: photos[0] } } : null;

function validate(it, isNew) {
  if (isNew || 'photos' in it) {
    if (!it.photos || !it.photos.length) throw new HttpError(400, '至少要一張照片');
    if (it.photos.length > 6) throw new HttpError(400, '照片最多 6 張（主圖 + 5 張副圖）');
  }
  for (const [k, label] of [['category', '類別'], ['size', '尺寸'], ['season', '季節']]) {
    if ((isNew || k in it) && !it[k]) throw new HttpError(400, `請選擇${label}`);
  }
}

// 把頁面最下方的照片換成新的（只動圖片區塊，你在 Notion 手寫的文字不會被刪）
async function replaceImages(env, pageId, photos) {
  let cursor;
  const old = [];
  do {
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const r = await notion(env, `/blocks/${pageId}/children${q}`);
    r.results.forEach((b) => b.type === 'image' && old.push(b.id));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  for (const id of old) await notion(env, `/blocks/${id}`, 'DELETE');
  if (photos.length)
    await notion(env, `/blocks/${pageId}/children`, 'PATCH', { children: photos.map(imageBlock) });
}

const sameList = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

// 自動整理資料庫欄位（舊版資料庫升級用），每 5 分鐘最多檢查一次
const OLD_NAMES = { [P.condition]: '品相' };
const schemaCache = {};
async function ensureSchema(env, dbId) {
  const c = schemaCache[dbId];
  if (c && Date.now() - c.t < 5 * 60 * 1000) return c;
  let db = await notion(env, `/databases/${dbId}`);
  const patch = {};
  for (const [now, old] of Object.entries(OLD_NAMES)) {
    if (!db.properties[now] && db.properties[old]) patch[db.properties[old].id] = { name: now }; // 欄位改名
  }
  if (!db.properties[P.buyDate]) patch[P.buyDate] = { date: {} };
  if (!db.properties[P.fit]) patch[P.fit] = { select: opt(FIT_OPTIONS, 'blue') };
  if (Object.keys(patch).length) db = await notion(env, `/databases/${dbId}`, 'PATCH', { properties: patch });
  const brand = db.properties[P.brand];
  return (schemaCache[dbId] = { t: Date.now(), db, brandType: brand && brand.type === 'select' ? 'select' : 'rich_text' });
}

// ---------- 品牌尺寸表（和「小嘟衣櫥」放在同一個 Notion 頁面裡） ----------
// 每個品牌一筆；「尺寸表」欄位一行一個尺寸，格式：尺寸｜對照｜身高｜體重｜年齡
//   例：7호｜M｜95-100cm｜15-17kg｜4-5歲（在 Notion 裡直接改也可以）
const SIZES_TITLE = '品牌尺寸表';
const S = { brand: '品牌', table: '尺寸表', note: '備註', images: '尺寸表圖片' };
const SIZES_SCHEMA = {
  [S.brand]: { title: {} },
  [S.table]: { rich_text: {} },
  [S.note]: { rich_text: {} },
  [S.images]: { files: {} },
};
// 第一次建立時先放進去的兩個品牌（圖片放在 GitHub Pages 上）
const CHART = 'https://yamap610.github.io/xiaodu-closet/sizecharts/';
const SEED = [
  {
    brand: 'Daily Bebe',
    note: '韓國童裝，尺寸是「호」，括號是對應的英文尺寸。',
    images: [CHART + 'dailybebe.jpg'],
    rows: [
      ['3호', 'XS', 75, 85, '8-10kg', '1歲前後'], ['5호', 'S', 85, 95, '11-13kg', '2-3歲'],
      ['7호', 'M', 95, 100, '15-17kg', '4-5歲'], ['9호', 'L', 100, 110, '17-20kg', '5-6歲'],
      ['11호', 'XL', 110, 120, '19-22kg', '7-8歲'], ['13호', 'JS', 120, 125, '23-27kg', '8-9歲'],
      ['15호', 'JM', 125, 135, '27-31kg', '9-10歲'], ['17호', 'JL', 135, 140, '32-35kg', '10-11歲'],
    ],
  },
  {
    brand: 'Moran',
    note: '套裝標準版。賣家實穿：男生 100cm/15kg 穿 L 剛好；女生 96cm/15kg 穿 L 稍鬆；76cm/10kg 穿 S（=80）。',
    images: [CHART + 'moran.jpg'],
    rows: [
      ['S', '', 70, 80, '10-14kg', ''], ['M', '', 80, 90, '15-16kg', ''],
      ['L', '', 90, 100, '17-19kg', ''], ['XL', '', 100, 110, '20-24kg', ''],
    ],
  },
  {
    brand: 'Peanuts House',
    note: '品牌改版後尺寸做小一號（Redo one size smaller）。官方示範：90cm 的小孩穿 5호。',
    images: [CHART + 'peanuts.jpg'],
    rows: [
      ['5호', '', 85, 93, '', '2-3歲'], ['7호', '', 93, 100, '', '3-4歲'], ['9호', '', 100, 107, '', '4-5歲'],
      ['11호', '', 107, 114, '', '5-6歲'], ['13호', '', 114, 120, '', '6-7歲'], ['15호', '', 120, 128, '', '7-8歲'],
    ],
  },
].map((b) => ({ ...b, rows: b.rows.map(([size, alt, hMin, hMax, weight, age]) => ({ size, alt, hMin, hMax, weight, age })) }));

const rowsToText = (rows) =>
  (rows || [])
    .filter((r) => r && String(r.size || '').trim())
    .map((r) => [
      String(r.size).trim(), (r.alt || '').trim(),
      r.hMin != null && r.hMin !== '' && r.hMax != null && r.hMax !== '' ? `${r.hMin}-${r.hMax}cm` : '',
      (r.weight || '').trim(), (r.age || '').trim(),
    ].map((x) => String(x).replace(/[｜|\n]/g, ' ')).join('｜'))
    .join('\n');
function textToRows(t) {
  return String(t || '').split(/\n+/).map((line) => {
    const f = line.split(/[｜|]/).map((x) => x.trim());
    if (!f[0]) return null;
    const h = (f[2] || '').match(/(\d+(?:\.\d+)?)\s*[-~–～—]\s*(\d+(?:\.\d+)?)/);
    return { size: f[0], alt: f[1] || '', hMin: h ? Number(h[1]) : null, hMax: h ? Number(h[2]) : null, weight: f[3] || '', age: f[4] || '' };
  }).filter(Boolean);
}
function pageToBrand(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    brand: plain(p[S.brand] && p[S.brand].title),
    rows: textToRows(plain(p[S.table] && p[S.table].rich_text)),
    note: plain(p[S.note] && p[S.note].rich_text),
    images: ((p[S.images] && p[S.images].files) || [])
      .map((f) => (f.external ? f.external.url : f.file ? f.file.url : ''))
      .filter(Boolean),
    edited: page.last_edited_time,
  };
}
function brandToProps(b) {
  const props = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (has('brand')) props[S.brand] = { title: text(b.brand) };
  if (has('rows')) props[S.table] = { rich_text: text(rowsToText(b.rows)) };
  if (has('note')) props[S.note] = { rich_text: text(b.note) };
  if (has('images'))
    props[S.images] = {
      files: (b.images || []).slice(0, 6).map((url, i) => ({ name: `尺寸表${i + 1}`, type: 'external', external: { url } })),
    };
  return props;
}
async function createBrand(env, sizesDb, b) {
  return notion(env, '/pages', 'POST', {
    parent: { database_id: sizesDb },
    properties: brandToProps(b),
    children: (b.images || []).map(imageBlock),
  });
}
// 找到（或第一次自動建立）品牌尺寸表
const sizesCache = {};
async function ensureSizesDb(env, dbId) {
  if (sizesCache[dbId]) return sizesCache[dbId];
  const { db } = await ensureSchema(env, dbId);
  const parent = db.parent && db.parent.type === 'page_id' ? db.parent.page_id : null;
  if (!parent) throw new HttpError(400, '「小嘟衣櫥」資料庫不在一般頁面裡，沒辦法自動建立品牌尺寸表');
  let cursor;
  do {
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const r = await notion(env, `/blocks/${parent}/children${q}`);
    const hit = r.results.find((b) => b.type === 'child_database' && b.child_database.title === SIZES_TITLE);
    if (hit) return (sizesCache[dbId] = hit.id);
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  const created = await notion(env, '/databases', 'POST', {
    parent: { type: 'page_id', page_id: parent },
    title: text(SIZES_TITLE),
    icon: { type: 'emoji', emoji: '📏' },
    properties: SIZES_SCHEMA,
  });
  for (const b of SEED) await createBrand(env, created.id, b);
  return (sizesCache[dbId] = created.id);
}

// ---------- 主程式 ----------
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (!env.NOTION_TOKEN) throw new HttpError(500, 'Worker 還沒設定 NOTION_TOKEN');
      if (!env.APP_PASSWORD) throw new HttpError(500, 'Worker 還沒設定 APP_PASSWORD');
      if (request.headers.get('X-App-Key') !== env.APP_PASSWORD)
        throw new HttpError(401, '密碼不正確');

      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean); // ['items', ':id']
      const dbId = (env.DATABASE_ID || request.headers.get('X-Db-Id') || '').trim();
      const needDb = () => {
        if (!dbId) throw new HttpError(400, '還沒有資料庫 ID，請先到設定頁建立資料庫');
        return dbId;
      };
      const body = ['POST', 'PATCH'].includes(request.method)
        ? await request.json().catch(() => ({}))
        : {};

      // 測試連線
      if (parts[0] === 'ping') {
        let dbTitle = null;
        if (dbId) {
          const db = await notion(env, `/databases/${dbId}`);
          dbTitle = plain(db.title);
        }
        return json({ ok: true, dbTitle });
      }

      // 建立資料庫：在你指定的 Notion 頁面裡面建立「小嘟衣櫥」
      if (parts[0] === 'setup' && request.method === 'POST') {
        if (!body.parentPageId) throw new HttpError(400, '缺少 Notion 頁面 ID');
        const db = await notion(env, '/databases', 'POST', {
          parent: { type: 'page_id', page_id: body.parentPageId },
          title: text('小嘟衣櫥'),
          icon: { type: 'emoji', emoji: '👗' },
          properties: SCHEMA,
        });
        return json({ ok: true, databaseId: db.id });
      }

      // 取得選項（包含你後來新增的尺寸、類別）
      if (parts[0] === 'schema') {
        delete schemaCache[needDb()];
        const { db } = await ensureSchema(env, needDb());
        const out = {};
        for (const [key, name] of Object.entries(P)) {
          const prop = db.properties[name];
          if (prop && prop.type === 'select') out[key] = prop.select.options.map((o) => o.name);
        }
        return json(out);
      }

      if (parts[0] === 'items') {
        const id = parts[1];
        const { brandType } = await ensureSchema(env, needDb());

        // 讀取全部
        if (!id && request.method === 'GET') {
          const items = [];
          let cursor;
          do {
            const r = await notion(env, `/databases/${needDb()}/query`, 'POST', {
              page_size: 100,
              start_cursor: cursor,
              sorts: [{ timestamp: 'created_time', direction: 'descending' }],
            });
            r.results.forEach((pg) => items.push(pageToItem(pg)));
            cursor = r.has_more ? r.next_cursor : undefined;
          } while (cursor);
          return json({ items });
        }

        // 新增
        if (!id && request.method === 'POST') {
          validate(body, true);
          const page = await notion(env, '/pages', 'POST', {
            parent: { database_id: needDb() },
            cover: cover(body.photos),
            properties: itemToProps(body, brandType),
            children: body.photos.map(imageBlock),
          });
          return json({ item: pageToItem(page) });
        }

        // 修改
        if (id && request.method === 'PATCH') {
          validate(body, false);
          const patch = { properties: itemToProps(body, brandType) };
          let photosChanged = false;
          if ('photos' in body) {
            const cur = pageToItem(await notion(env, `/pages/${id}`));
            photosChanged = !sameList(cur.photos, body.photos);
            if (photosChanged) patch.cover = cover(body.photos);
          }
          const page = await notion(env, `/pages/${id}`, 'PATCH', patch);
          if (photosChanged) await replaceImages(env, id, body.photos);
          return json({ item: pageToItem(page) });
        }

        // 刪除（移到 Notion 垃圾桶，30 天內可以在 Notion 救回）
        if (id && request.method === 'DELETE') {
          await notion(env, `/pages/${id}`, 'PATCH', { archived: true });
          return json({ ok: true });
        }
      }

      // 品牌尺寸表
      if (parts[0] === 'sizes') {
        const id = parts[1];
        const sizesDb = await ensureSizesDb(env, needDb());
        const check = (b, isNew) => {
          if ((isNew || 'brand' in b) && !String(b.brand || '').trim()) throw new HttpError(400, '請填品牌名稱');
          if ((isNew || 'rows' in b) && !(b.rows || []).some((r) => r && String(r.size || '').trim()))
            throw new HttpError(400, '至少要有一個尺寸');
        };
        if (!id && request.method === 'GET') {
          const brands = [];
          let cursor;
          do {
            const r = await notion(env, `/databases/${sizesDb}/query`, 'POST', { page_size: 100, start_cursor: cursor });
            r.results.forEach((pg) => brands.push(pageToBrand(pg)));
            cursor = r.has_more ? r.next_cursor : undefined;
          } while (cursor);
          brands.sort((a, b) => a.brand.localeCompare(b.brand));
          return json({ brands });
        }
        if (!id && request.method === 'POST') {
          check(body, true);
          return json({ brand: pageToBrand(await createBrand(env, sizesDb, body)) });
        }
        if (id && request.method === 'PATCH') {
          check(body, false);
          let imagesChanged = false;
          if ('images' in body) imagesChanged = !sameList(pageToBrand(await notion(env, `/pages/${id}`)).images, body.images);
          const page = await notion(env, `/pages/${id}`, 'PATCH', { properties: brandToProps(body) });
          if (imagesChanged) await replaceImages(env, id, body.images || []);
          return json({ brand: pageToBrand(page) });
        }
        if (id && request.method === 'DELETE') {
          await notion(env, `/pages/${id}`, 'PATCH', { archived: true });
          return json({ ok: true });
        }
      }

      throw new HttpError(404, '沒有這個功能');
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 500);
    }
  },
};
