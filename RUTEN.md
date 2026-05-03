# Ruten 自訂分支說明

本文件記錄 ruten 自訂 patch 清單與升版操作步驟。

---

## 升版 SOP

```bash
# 1. 建立新分支
git checkout -b ruten-X.Y.Zrc<N>

# 2. Stash WIP（若有）
git stash push -m "wip: ..."

# 3. Merge 新 tag
git merge X.Y.Zrc<N> --no-edit

# 4. Pop stash，手動解衝突
git stash pop

# 5. 對照 CHANGELOG 逐一檢查 patch 是否仍需要
#    上游已修 → 刪除 patch 檔
#    有衝突   → 手動 reapply

# 6. 重新產生 patch 檔
git diff <new-tag>..HEAD -- <files> > patches/NNN-xxx.patch

# 7. Commit
git add patches/ RUTEN.md && git commit
```

---

## Patch 清單

| # | Patch | 狀態 | 說明 |
|---|-------|------|------|
| [001](#001) | `001-elasticsearch-no-sqlglot.patch` | ✅ | ES 不走 sqlglot，改用自訂解析器 |
| [002](#002) | `002-oracle-rownum-limit.patch` | ✅ | Oracle 11g ROWNUM workaround |
| [003](#003) | `003-pivot-table-date-nan.patch` | ✅ | Pivot Table 日期欄顯示 NaN |
| [004](#004) | `004-es2015-compat.patch` | ✅ | TagsList `toSorted` → `slice().sort()` |
| [005](#005) | `005-table-chart-search-box.patch` | ✅ | Table Chart 搜尋框輸入被清空 |
| [006](#006) | `006-security-permission-api.patch` | ✅ | PermissionViewMenu dot-notation 篩選 |

---

## 001

**檔案**：`superset/sql/parse.py`、`superset/db_engine_specs/elasticsearch.py`、`base.py`、`models/helpers.py`

**根因**：Superset 的 SQL 解析層統一使用 sqlglot，但 elasticsearch-dbapi 的 SQL 方言與 sqlglot 不相容——`MATCH()` 等 ES 特有函式會導致 sqlglot 拋出 parse error，查詢完全無法執行。

**修改**：新增 `ElasticsearchStatement` 繞過 sqlglot，使用純字元掃描處理 ES SQL。新增 `get_statement_class(engine)` helper，讓 `base.py`、`models/helpers.py` 依引擎選擇正確的 Statement class。

**移除條件**：sqlglot 新增 ES dialect 且正確處理 `MATCH()` 語法（sqlglot 28.10.0 仍無）。`get_statement_class()` 與 002 共用，需一起評估。

---

## 002

**檔案**：`superset/sql/parse.py`（`SQLStatement.set_limit_value`）

**根因**：Oracle 11g 不支援 `FETCH FIRST N ROWS ONLY`（Oracle 12c+ 才有）。上游 [PR #33473](https://github.com/apache/superset/pull/33473) 改用此語法後，所有 Oracle 11g 查詢在 Superset 加 LIMIT 時全部失敗。

**修改**：`set_limit_value` 對 `engine == "oracle"` 改用 `SELECT * FROM (...) WHERE ROWNUM <= N`。

**移除條件**：環境確認升至 Oracle 12c+。修改位置（L808）與 001（L1280+）不重疊。

---

## 003

**檔案**：`superset-frontend/packages/superset-ui-core/src/time-format/utils/stringifyTimeInput.ts`

**根因**：ES 等部分 DB 回傳日期欄位為字串格式（`"2024-01-01"` 或純數字 ms `"1704067200000"`）。`stringifyTimeInput` 原始簽章只接受 `Date | number`，收到字串時 `new Date(string)` 在部分格式下產生 `Invalid Date`，Pivot Table 日期欄因此顯示 NaN。

**修改**：擴充型別接受 `string`；純數字字串視為 ms timestamp；其他字串先過 `normalizeTimestamp()` 再轉換。

**移除條件**：上游修正此函式的型別簽章（6.1.0rc3 仍未修）。

---

## 004

**檔案**：`superset-frontend/src/components/TagsList/index.tsx`

**根因**：`Array.prototype.toSorted()`（ES2023）在 ES2015 bundle target 的瀏覽器環境中不存在，執行時報錯。

**修改**：`tags.toSorted(...)` → `tags.slice().sort(...)`。

**移除條件**：bundle target 升為 ES2023+。

---

## 005

**檔案**：`DataTable.tsx`、`GlobalFilter.tsx`、`useAsyncState.ts`

**根因**：Table Chart 搜尋框輸入後會被清空。觸發路徑：用戶輸入 → `onFilteredRowsChange` → `setDataMask` → 圖表重新渲染 → react-table `autoResetGlobalFilter`（預設 true）重置 filter state → `filterValue` 回到 `''` → `useAsyncState` 同步覆蓋 input。server-side pagination 時另一條路：ownState 重置導致 `filterValue` 暫時為 `''`，同樣觸發覆蓋。

**修改**：`autoResetGlobalFilter: false` 防止 data 變動時重置；`useAsyncState` 新增 `shouldSync` guard；`GlobalFilter` 傳入 focus guard（input focus 時不允許外部覆蓋）。

**移除條件**：上游完整修正 client-side 與 server-side 兩種路徑。上游 rc3 的 [PR #39707](https://github.com/apache/superset/pull/39707) 僅修了 client-side（條件式 reset），未修 server-side，此 patch 仍需保留。合併含 #39707 的版本時，`DataTable.tsx` 會有重複的 `autoResetGlobalFilter`，需手動保留 `false`、刪除條件式版本。

---

## 006

**檔案**：`superset/security/manager.py`

**根因**：FAB 的 `Filters.__init__` 處理 `search_filters` 時對 key 執行 `+=`，要求 key 必須已存在。dot-notation 關聯欄位（`permission.name`、`view_menu.name`）不會被 `_init_properties` 自動偵測，key 不存在導致執行時拋 `KeyError`，無法以這些欄位篩選 PermissionViewMenu API。

**修改**：新增 `SupersetPermissionViewMenuApi`，在 `_init_properties` 執行後手動注入 `FilterContains` 實例。

**移除條件**：FAB 修正 dot-notation 欄位的自動偵測。
