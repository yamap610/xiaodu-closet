# 小嘟衣櫥 v2（Notion 版）

記錄小嘟的衣服：照片、類別、尺寸、季節、去向、新舊程度、價格，並能把要賣的衣服做成拍賣卡（1080×1350）分享到 IG／FB。

## 架構

```
手機網頁 index.html（GitHub Pages）
   │  照片 ──────────→ Cloudinary（存照片，網址永久有效）
   │  資料 ──→ Cloudflare Worker（worker.js，保管 Notion 金鑰）──→ Notion 資料庫
```

- `index.html`：手機網頁，整個 app 就這一個檔案
- `worker.js`：貼到 Cloudflare Worker 的程式

---

## 第一次設定（大約 15 分鐘）

### 步驟 1：建立 Notion integration（拿到金鑰）

1. 打開 <https://www.notion.so/profile/integrations>
2. 按「新增 integration」
   - 名稱：`小嘟衣櫥`
   - 工作區：選你要放資料的工作區
   - 類型：Internal（內部）
3. 儲存後，複製「Internal Integration Secret」（`ntn_` 開頭的一長串）
   ⚠️ 這串就是鑰匙，不要貼給任何人或放進 GitHub

### 步驟 2：準備一個 Notion 頁面

1. 在 Notion 新增一個空白頁面，例如取名「小嘟」
2. 頁面右上角 `⋯` → 「連結」（Connections）→ 搜尋「小嘟衣櫥」→ 確認
3. 先把這個頁面的連結複製起來（右上角「分享」→「複製連結」），步驟 4 會用到

### 步驟 3：架 Cloudflare Worker（中介小管理員）

1. 到 <https://dash.cloudflare.com> 註冊或登入（免費方案就夠用）
2. 左側選單「Workers & Pages」→「Create」→ 選「Start with Hello World!」
3. 名稱填 `xiaodu-closet` → 按「Deploy」
4. 部署完按「Edit code」，把編輯器裡的程式**全部刪掉**，貼上本 repo 的 `worker.js` 全部內容 → 按右上「Deploy」
5. 回到這個 Worker 的頁面 →「Settings」→「Variables and Secrets」→「Add」，新增兩個（類型都選 **Secret**）：

   | 名稱 | 值 |
   |---|---|
   | `NOTION_TOKEN` | 步驟 1 複製的 `ntn_...` |
   | `APP_PASSWORD` | 自己想一組密碼（網頁會用到） |

   新增完按「Deploy」
6. 複製 Worker 網址，長得像 `https://xiaodu-closet.你的帳號.workers.dev`

### 步驟 4：打開網頁，連上 Notion

1. 手機打開 <https://yamap610.github.io/xiaodu-closet/>（建議 Safari「分享 → 加入主畫面」）
2. 第一次打開會自動進入設定頁：
   - 填入 **Worker 網址**、**密碼** → 按「儲存」→ 按「測試連線」
   - 在「建立 Notion 資料庫」貼上步驟 2 的頁面連結 → 按「建立『小嘟衣櫥』資料庫」
3. 完成！Notion 的「小嘟」頁面裡會出現「小嘟衣櫥」資料庫

> 換手機或用電腦開時：一樣填 Worker 網址和密碼，再把「資料庫 ID」從舊手機的設定頁抄過去就好（不要再按一次建立）。

### （選用）Notion 裡用圖庫看衣服

資料庫右上角「＋」新增檢視 →「圖庫」（Gallery）→ 版面設定的「卡片預覽」選「頁面封面」，就會用主圖當卡片圖。
每筆資料點進去，最下方也會有全部照片。

---

## 欄位

| Notion 欄位 | 類型 | 說明 |
|---|---|---|
| 名稱 | 標題 | |
| 照片 | 檔案 | 主圖 + 最多 5 張副圖（Cloudinary 網址）＊必填 |
| 類別 | 單選 | 洋裝／上衣／裙子／褲子／連身／配件／背心外套／其他，可新增 ＊必填 |
| 品牌 | 單選 | 用過的品牌會變成選項，可新增 |
| 尺寸 | 單選 | 70／80／90／SS／S／M／L／18m／24m，可新增 ＊必填 |
| 季節 | 單選 | 春夏／秋冬／四季 ＊必填 |
| 購買價格 | 數字 | |
| 去向 | 單選 | 未來穿／現在穿／穿不下／待整理／待出售／已售出／贈與／淘汰 |
| 新舊程度 | 單選 | 全新／全新無吊牌／九成新／八成新／七成新／有小瑕疵／有污漬 |
| 預計售價 | 數字 | 去向為「待出售」時顯示 |
| 售出金額 | 數字 | 去向為「已售出」時顯示 |
| 備註 | 文字 | |
| 購買日期 | 日期 | 只記年月（存成該月 1 號），每月花費統計用 |
| 建立時間 | 自動 | |

⚠️ 請不要在 Notion 裡改**欄位名稱**，否則網頁會讀不到；選項（例如新增尺寸）可以隨意加。

## 其他說明

- 刪除的衣服會移到 Notion 垃圾桶，30 天內可以救回
- 照片上傳前會自動壓縮成最長邊 1600px
- 照片存在 Cloudinary（cloud name `dxd5ijwof`，preset `ml_default`），已預先填好
- 舊版（Firebase）在 git 紀錄裡，需要時可以找回
