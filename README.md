# Optimization Visual Lab

這是一個用來理解 **loss geometry**、**optimizer trajectory** 與 **convergence** 的中英雙語互動式網站。整個實驗都在瀏覽器本機執行，不需要後端或資料庫。

線上版本：[Optimization Visual Lab](https://rozias0925.github.io/FY26-Optimization-Visual-Lab/)

第一次打開專案時，請先看 **`從這裡開始.md`**。那份檔案只列出真正需要認識的內容，也會解釋哪些自動產生的資料夾可以完全忽略。

## 怎麼打開

在這個資料夾開啟終端機，執行：

```powershell
pnpm dev
```

然後用瀏覽器打開 `http://localhost:3000`。

## 主要檔案

### `app/page.tsx`

網站首頁入口。它的工作很單純：載入 `OptimizationLab` 主畫面。

### `app/layout.tsx`

整個網站共用的外框與 metadata，包括網站標題、描述、字體，以及 KaTeX 數學式樣式。

### `app/globals.css`

全站視覺設定，包括淺色背景、顏色、字體、邊框與共用 CSS。想調整整體風格時，先看這裡。

### `components/optimization-lab.tsx`

網站的主要互動流程：

- 中文／English 切換與所有教學文字
- Objective、Optimizer 與 hyperparameter 控制
- Preset experiments
- 執行後自動捲動與三秒倒數
- 動畫播放、暫停、速度與完成狀態
- Result ledger、數學版 Optimizer 原理與動態 Takeaways

想改畫面順序、按鈕文字、教學內容或倒數流程，主要就是修改這個檔案。

### `components/optimization-plot.tsx`

負責兩張圖：

- Loss surface 的 contour 與 optimizer trajectories
- Loss vs. Iteration curve

它也負責滑鼠點擊座標、滾輪縮放、等比例座標、熱力圖、動畫插值與 Canvas 繪圖。想調整圖表外觀或動畫節奏的呈現方式，就看這裡。

### `components/math.tsx`

把 LaTeX 字串交給 KaTeX，輸出正式的數學排版。所有數學式最後都會經過這個小元件。

### `lib/optimization.ts`

網站的數學核心，與畫面顯示分開：

- Quadratic、Rosenbrock、Himmelblau objective functions
- Function value、Gradient、Hessian
- Gradient Descent、Momentum、Adam、Newton、BFGS
- Convergence、divergence 與 numerical failure 判斷
- 統一的 `OptimizationResult` 結果格式

想修改 optimizer 算法、停止條件或新增 objective function，就從這裡開始。

### `components/ui/`

由 shadcn 提供的標準 UI 元件，例如 Button、Slider、Select、Tabs、Checkbox。這些是底層積木，通常不需要直接修改。

### `lib/utils.ts` 與 `hooks/`

shadcn 元件使用的共用工具與 responsive helper。除非要改底層 UI 系統，否則可以先不用碰。

## 專案設定檔

- `package.json`：專案名稱、啟動／建置指令與使用的套件。
- `pnpm-lock.yaml`：鎖定每個套件的精確版本，不建議手動修改。
- `pnpm-workspace.yaml`：pnpm 的本機建置安全設定。
- `tsconfig.json`：TypeScript 規則與路徑設定。
- `vite.config.ts`：Vinext／Vite 的開發與正式建置設定。
- `next.config.ts`：Next-compatible framework 設定。
- `.openai/hosting.json`：未來要使用 Sites 發布時的 hosting 設定；目前仍維持本機版本。

## 想修改什麼，要去哪裡？

| 想修改的內容                    | 主要檔案                                                   |
| ------------------------------- | ---------------------------------------------------------- |
| 中文文字、段落順序、按鈕        | `components/optimization-lab.tsx`                          |
| 倒數與動畫速度                  | `components/optimization-lab.tsx`                          |
| Contour、trajectory、loss curve | `components/optimization-plot.tsx`                         |
| 數學公式排版                    | `components/math.tsx` 與 `components/optimization-lab.tsx` |
| Objective 或 Optimizer 數學算法 | `lib/optimization.ts`                                      |
| 全站顏色與風格                  | `app/globals.css`                                          |
| 網站標題與描述                  | `app/layout.tsx`                                           |
