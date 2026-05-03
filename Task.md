# Ruten Superset 自訂 Patch 記錄

本文件記錄所有與上游（apache/superset）不同的自訂修改，供升版時參考。

每個 patch 均儲存於 `patches/` 目錄。  
命名規則：`NNN-description.patch`（已穩定）、`NNN-description.wip.patch`（實驗中）

---

## 升版 SOP

```bash
# 1. 建立新分支
git checkout -b ruten-X.Y.Zrc<N>

# 2. 先 stash WIP 改動（若有）
git stash push -m "wip: ..."

# 3. Merge 新 tag
git merge X.Y.Zrc<N> --no-edit

# 4. Pop stash，手動解衝突
git stash pop

# 5. 逐一檢查每個 patch 是否仍需要（對照 CHANGELOG）
#    - 上游已修：刪除對應 patch
#    - 仍需要但有衝突：手動 reapply

# 6. 重新產生 patch 檔（確保與最新 HEAD 一致）
git diff HEAD -- <files> > patches/NNN-xxx.wip.patch
git diff <new-tag>..HEAD -- <files> > patches/NNN-xxx.patch
```

---

## Patch 清單

| # | 檔案 | 狀態 | 說明 |
|---|------|------|------|
| [001](#001-elasticsearch-no-sqlglot) | `001-elasticsearch-no-sqlglot.patch` | ✅ 已穩定 | ES 不走 sqlglot，改用自訂解析器（547 行） |
| [002](#002-oracle-rownum-limit) | `002-oracle-rownum-limit.patch` | ✅ 已穩定 | Oracle 11g ROWNUM workaround（25 行） |
| [003](#003-pivot-table-date-nan) | `003-pivot-table-date-nan.patch` | ✅ 已穩定 | Pivot Table 日期欄顯示 NaN 修正 |
| [004](#004-es2015-compat) | `004-es2015-compat.patch` | ✅ 已穩定 | ES2015 不相容 API 替換 |
| [005](#005-table-chart-search-box) | `005-table-chart-search-box.patch` | ✅ 已穩定 | Table Chart 搜尋框被清空修正 |
| [006](#006-security-permission-api) | `006-security-permission-api.patch` | ✅ 已穩定 | PermissionViewMenu API 篩選支援 |

---

## 001 Elasticsearch No-Sqlglot

**Patch 檔**：`patches/001-elasticsearch-no-sqlglot.patch`（547 行）  
**狀態**：✅ 已穩定（自 ruten-6.1.0rc1 起）  
**Commits**：`1a5eb281af`、`139500ede6`、`372ca3af5a`  
**相依**：無（獨立）

### 問題

Superset 的 SQL 解析層（`sql/parse.py`）統一使用 sqlglot 處理所有 DB engine 的 SQL。  
但 elasticsearch-dbapi 使用的 SQL 方言和 sqlglot 不相容，導致：

1. **sqlglot 解析 ES SQL 拋例外**，查詢完全無法執行
2. **型別對應空白**：`ElasticSearchEngineSpec.type_code_map` 原本為 `{}`，ES-DBAPI 回傳的 int type code 無法對應到 SQLAlchemy 型別，欄位一律被辨識為 UNKNOWN

另有 Oracle 11g 問題一並在此 patch 修正：

3. **Oracle 11g 不支援 `FETCH FIRST N ROWS ONLY`**（僅 Oracle 12c+ 才支援），上游 [PR #33473](https://github.com/apache/superset/pull/33473) 的實作導致 Oracle 11g 查詢失敗

### 修改內容

**`superset/sql/parse.py`**
- 新增 `ElasticsearchStatement` 類別（繼承 `BaseSQLStatement[str]`），使用純字元掃描取代 sqlglot
- 新增 `split_elasticsearch_sql()` 分號切割器（處理字串/註解內的分號）
- 新增 `_iter_elasticsearch_tokens()` token 迭代器（用於找 LIMIT 位置）
- `SQLScript.special_engines` 加入 `"elasticsearch": ElasticsearchStatement`
- 新增 `get_statement_class(engine)` helper，讓各呼叫點依引擎選擇正確的 Statement class
- `SQLStatement.set_limit_value()` 加入 Oracle ROWNUM workaround：
  對 `engine == "oracle"` 改用 `SELECT * FROM (...) WHERE ROWNUM <= N`
- `sanitize_clause()` 改用 `get_statement_class()`；ES engine 直接 return（不做 sqlglot 驗證）

**`superset/db_engine_specs/elasticsearch.py`**
- 補上 `type_code_map = {1: "STRING", 2: "NUMBER", 3: "BOOLEAN", 4: "DATETIME"}`
- 新增 `column_type_mappings`，對應到 SQLAlchemy 型別與 `GenericDataType`
- 覆寫 `get_datatype()` 走 `type_code_map`

**`superset/db_engine_specs/base.py`**
- `_get_cte_query()` 改用 `get_statement_class()` 取代 hardcode `SQLStatement`

**`superset/models/helpers.py`**
- `validate_adhoc_subquery()` 改用 `get_statement_class()` 取代 hardcode `SQLStatement`

### sqlglot 28.10.0 相容性確認（2026-05-03）

| ES SQL 語法 | sqlglot 直接解析 | ElasticsearchStatement |
|---|---|---|
| `SELECT * FROM index LIMIT 10` | ✅ OK | ✅ OK |
| `SELECT * FROM "logs-*"` | ✅ OK | ✅ OK |
| `SELECT * FROM logs WHERE MATCH(msg, 'err')` | ❌ FAIL（MatchAgainst 語法不符）| ✅ OK |
| `SHOW TABLES` | ⚠️ 降級為 Command | ✅ OK |
| `DESCRIBE logs` | ✅ OK | ✅ OK |

**結論**：sqlglot 28.10.0 仍無 ES 方言，`MATCH()` 函式解析失敗。patch 依舊必要。

### 升版注意

- 確認 sqlglot changelog 是否新增 ES dialect，若有可評估移除此 patch
- `get_statement_class()` helper 為 ES patch 的基礎設施，Oracle patch 不依賴它

---

## 002 Oracle ROWNUM Limit

**Patch 檔**：`patches/002-oracle-rownum-limit.patch`（25 行）  
**狀態**：✅ 已穩定（自 ruten-6.1.0rc1 起）  
**Commit**：`f800c14370`  
**相依**：無（獨立於 001）

### 問題

Oracle 12c 以前不支援 `FETCH FIRST N ROWS ONLY` 語法，上游 [PR #33473](https://github.com/apache/superset/pull/33473) 改用此語法後，Oracle 11g 的查詢全部失敗。

### 修改內容

**`superset/sql/parse.py`**：`SQLStatement.set_limit_value()` 加入 oracle 分支：
```sql
-- 原本輸出（Oracle 12c+ only）
SELECT * FROM employees FETCH FIRST 100 ROWS ONLY

-- 修改後輸出（Oracle 11g 相容）
SELECT * FROM (SELECT * FROM employees) WHERE ROWNUM <= 100
```

### 升版注意

- 若環境確認升為 Oracle 12c+，可移除此 patch
- 與 001 patch 在 `parse.py` 的修改位置不同（L808 vs L1280+），apply 時不會互相衝突

---

## 003 Pivot Table Date NaN

**Patch 檔**：`patches/003-pivot-table-date-nan.patch`  
**狀態**：✅ 已穩定（自 ruten-6.1.0rc1 起）  
**Commit**：`c8769e5ef9`

### 問題

Pivot Table 的日期欄位顯示 `NaN`。  
根因：部分 DB（含 ES）回傳日期時為字串格式（`"2024-01-01"` 或純數字 ms `"1704067200000"`），
`stringifyTimeInput()` 原始簽章只接受 `Date | number`，收到字串時轉型失敗 → `Invalid Date` → `NaN`。

### 修改內容

**`superset-frontend/packages/superset-ui-core/src/time-format/utils/stringifyTimeInput.ts`**

- 函式簽章擴充：`value` 接受 `string`
- 純數字字串 → 視為 ms timestamp 轉 `Number` 再 `new Date()`
- 其他字串 → 先過 `normalizeTimestamp()`（已存在的 util）再 `new Date()`

### 升版注意

- 確認上游是否已更新 `stringifyTimeInput` 的型別簽章
- `normalizeTimestamp` 在 `superset-ui-core` 中已存在，若路徑變動需更新 import

---

## 004 ES2015 Compat

**Patch 檔**：`patches/004-es2015-compat.patch`  
**狀態**：✅ 已穩定（自 ruten-6.1.0rc1 起）  
**Commit**：`1d333c7893`

### 問題

生產環境的 JS bundle 目標為 ES2015，`Array.prototype.toSorted()`（ES2023）在 `TagsList/index.tsx` 使用，會在舊版瀏覽器環境中報錯。

`dashboardState.js` 原先也有 `Set.prototype.difference/union`（ES2024）的修正，但上游 rc3 的 commit `fc5506e466` 已將整個 `.js` 遷移為 `dashboardState.ts`，新版用 `filter()` + `forEach()` 改寫，不再需要 polyfill，因此舊的 `.js` 已刪除。

### 修改內容

**`superset-frontend/src/components/TagsList/index.tsx`**
- `tags.toSorted(...)` → `tags.slice().sort(...)`

### 升版注意

- 確認上游是否已將 `toSorted()` 改回或 bundle target 升為 ES2023+，若有則此 patch 可移除

---

## 005 Table Chart Search Box

**Patch 檔**：`patches/005-table-chart-search-box.patch`  
**狀態**：✅ 已穩定

### 問題

Table Chart 的 Search 輸入框打字後，搜尋會套用，但 input 的值隨即被清掉變成空字串。  
6.0.x 開始出現，由兩個 feature 的交互作用引入。

### 根因

**核心機制**：`useAsyncState` 每次 render 若外部 `initialValue` 與上一次不同，會同步回本地 state（覆蓋使用者輸入）。

**引入問題的兩個路徑**：

1. **Backend Search（PR #33357）**：server-side pagination 時 `filterValue` 來自外部 `serverPaginationData.searchText`，圖表 reload 期間 ownState 被重置 → `filterValue` 暫時回到 `''` → `useAsyncState` 清掉 input

2. **Export with Search box（PR #36281）**：
   ```
   用戶搜尋 → react-table 過濾 rows → onFilteredRowsChange
   → setClientViewRows → updateTableOwnState → setDataMask
   → 圖表重新渲染 → autoResetGlobalFilter（預設 true）
   → globalFilter 重置 → filterValue = '' → input 被清空
   ```

### 修改內容

**`DataTable.tsx`**：加入 `autoResetGlobalFilter: false`，防止 data prop 改變時清掉 globalFilter state

**`useAsyncState.ts`**：新增可選 `shouldSync?: () => boolean` 參數，讓呼叫端控制是否允許外部覆蓋本地 state

**`GlobalFilter.tsx`**：傳入 focus guard `() => !isSearchFocused.get(id)`，input 有 focus 時不允許外部覆蓋

### 與上游 rc3 的關係

上游 rc3 的 [PR #39707](https://github.com/apache/superset/pull/39707) 針對同一問題做了部分修正，但做法不同：

| | 我們的做法 | PR #39707 |
|---|---|---|
| `autoResetGlobalFilter` | `false`（永遠關閉）| `!isEqual(columnNames, previousColumnNames)`（條件式）|
| `useAsyncState` | 新增 `shouldSync` guard | 未修改 |
| `GlobalFilter` | 新增 focus guard | 未修改 |
| server-side 模式保護 | ✅ 有（focus guard）| ❌ 沒有 |

### 升版注意

- 升版到包含 PR #39707 的版本後，`DataTable.tsx` 會有 `autoResetGlobalFilter` 重複，需手動保留 `false` 並刪除條件式版本
- 追蹤上游是否進一步修正 server-side 模式，確認是否可簡化此 patch

---

## 006 Security Permission API

**Patch 檔**：`patches/006-security-permission-api.patch`  
**狀態**：✅ 已穩定

### 問題

FAB（Flask-AppBuilder）內建的 `PermissionViewMenuApi` 不支援以 `permission.name` 和 `view_menu.name` 等 dot-notation 關聯欄位做搜尋篩選。

原因：FAB 的 `Filters.__init__` 在處理 `search_filters` 時對 key 做 `+=`，要求 key 必須已存在。dot-notation 的關聯欄位不會被 `_init_properties` 自動偵測，因此 key 不存在 → 執行時拋 `KeyError`。

### 修改內容

**`superset/security/manager.py`**

新增 `SupersetPermissionViewMenuApi`，繼承 `PermissionViewMenuApi`：
- 定義 `search_columns = ["id", "permission.name", "view_menu.name"]`
- 覆寫 `_init_properties()`，在 `super()` 之後手動將 dot-notation 欄位的 `FilterContains` 實例注入 `_filters._search_filters`

將 `SupersetSecurityManager.permission_view_menu_api` 指向此 class。

### 升版注意

- 此問題是 FAB 的設計限制，上游 Superset 不太可能主動修正
- 若 FAB 更新並修正 dot-notation 支援，可移除此 patch
- 測試：確認 `/api/v1/security/permissions-resources/` 的 `q` 篩選參數可正確以 `permission.name` 和 `view_menu.name` 搜尋

---

## 待辦事項

- [x] 刪除孤兒檔 `superset-frontend/src/dashboard/reducers/dashboardState.js`（已被 `.ts` 取代）
- [x] 驗證 005 Table Chart Search Box 並列入正式 patch
- [x] 驗證 006 Security Permission API 並列入正式 patch

---

*最後更新：2026-05-03，基於 ruten-6.1.0rc3*
