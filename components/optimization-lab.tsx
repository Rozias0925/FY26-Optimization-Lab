'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Lightbulb,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MathFormula } from '@/components/math';
import {
  getDisplaySpan,
  getVisibleStep,
  LossPlot,
  OPTIMIZER_COLORS,
  type PlotView,
  SurfacePlot,
} from '@/components/optimization-plot';
import {
  createObjective,
  runComparison,
  type ExperimentConfig,
  type ObjectiveId,
  type OptimizationResult,
  type OptimizerId,
  type Point,
  type RunStatus,
} from '@/lib/optimization';

type Lang = 'zh' | 'en';
type LocalText = { zh: string; en: string };

type ModelContextTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: ModelContextTool,
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

const optimizerOrder: OptimizerId[] = [
  'gd',
  'momentum',
  'adam',
  'newton',
  'bfgs',
];

const optimizerInfo: Record<
  OptimizerId,
  {
    name: string;
    short: string;
    formula: string;
    uses: LocalText;
    principle: LocalText;
    geometry: LocalText;
    convergence: LocalText;
    failure: LocalText;
  }
> = {
  gd: {
    name: 'Gradient Descent',
    short: 'GD',
    formula: String.raw`\mathbf{x}_{k+1}=\mathbf{x}_k-\eta\nabla f(\mathbf{x}_k)`,
    uses: { zh: '一階資訊：Gradient', en: 'First-order information: gradient' },
    principle: {
      zh: 'Gradient 是函數在當下的一階局部線性近似；負 Gradient 因而是 Euclidean metric 下最陡的下降方向。Learning rate η 把方向變成實際步長，但它並不知道不同方向的曲率尺度。',
      en: 'The gradient is the first-order local linear model of the objective, so its negative is the steepest descent direction under the Euclidean metric. The learning rate η converts that direction into a step, but does not account for directional curvature.',
    },
    geometry: {
      zh: '在等高線接近圓形時，GD 會直接走向中心；在 condition number 很大的橢圓谷底中，Gradient 幾乎指向陡峭方向，因此路徑會在谷底兩側 zig-zag，而沿平坦方向進展很慢。',
      en: 'With nearly circular contours, GD heads almost directly to the center. In an ill-conditioned elliptical valley, gradients point mostly across the steep direction, producing zig-zag motion and slow progress along the shallow direction.',
    },
    convergence: {
      zh: '若 f 是 L-smooth convex，取 0 < η < 2/L 可保證下降；對 μ-strongly convex 函數，固定步長的線性收斂率受 κ=L/μ 控制。κ 越大，理論與圖上的收斂都越慢。',
      en: 'For an L-smooth convex function, 0 < η < 2/L guarantees descent. Under μ-strong convexity, the linear convergence factor depends on κ=L/μ, so larger condition numbers mean slower theory and visibly slower trajectories.',
    },
    failure: {
      zh: '每步只需一次 Gradient，記憶體成本低；但 η 太大會震盪或發散，太小則極慢。在 non-convex 問題中，它也可能停在 saddle point 或局部 minimum。',
      en: 'Each step needs one gradient and little memory. An overly large η oscillates or diverges, while a small η is slow; on non-convex objectives it may also settle at a saddle or local minimum.',
    },
  },
  momentum: {
    name: 'Momentum',
    short: 'Momentum',
    formula: String.raw`\begin{aligned}\mathbf{v}_{k+1}&=\beta\mathbf{v}_k+\nabla f(\mathbf{x}_k)\\\mathbf{x}_{k+1}&=\mathbf{x}_k-\eta\mathbf{v}_{k+1}\end{aligned}`,
    uses: { zh: 'Gradient + 累積速度', en: 'Gradient + accumulated velocity' },
    principle: {
      zh: 'Momentum 對歷史 Gradient 做指數加權累積。連續同向的分量會相加，正負交替的分量會互相抵消；β 決定記憶有多長，η 則控制累積速度轉成位移的比例。',
      en: 'Momentum exponentially accumulates past gradients. Components that keep the same sign reinforce each other, while alternating components cancel. β controls memory length and η converts the accumulated velocity into displacement.',
    },
    geometry: {
      zh: '在狹長 quadratic valley 中，跨越谷底的 Gradient 方向經常反轉，所以 Momentum 會抑制橫向震盪；沿谷方向則持續同號，因此被加速。這正是它比 GD 更快穿越 valley 的原因。',
      en: 'Across a narrow quadratic valley, gradients repeatedly reverse, so momentum damps transverse oscillation. Along the valley they retain their sign and accumulate, which accelerates travel in the useful direction.',
    },
    convergence: {
      zh: '在 strongly convex quadratic 上，適當配對 η 與 β 可得到比 GD 更好的 spectral radius；但穩定區域同時依賴 Hessian eigenvalues。這表示換一個 landscape 後，原本好用的參數未必仍然穩定。',
      en: 'On strongly convex quadratics, a well-matched η and β can improve the spectral radius over GD. The stability region depends on Hessian eigenvalues, so parameters that work on one landscape may not remain stable on another.',
    },
    failure: {
      zh: '成本仍約為每步一次 Gradient，但多保存一個 velocity vector。β 或 η 太大會造成 overshoot、繞行 minimum，甚至因慣性離開安全區域。',
      en: 'The cost remains roughly one gradient per step plus one velocity vector. Excessive β or η causes overshoot, orbiting, or divergence through accumulated inertia.',
    },
  },
  adam: {
    name: 'Adam',
    short: 'Adam',
    formula: String.raw`\mathbf{x}_{t+1}=\mathbf{x}_t-\eta\frac{\widehat{\mathbf m}_t}{\sqrt{\widehat{\mathbf v}_t}+\epsilon}`,
    uses: {
      zh: '一階動量 + 座標別二階動量',
      en: 'First moment + coordinate-wise second moment',
    },
    principle: {
      zh: 'Adam 同時估計 Gradient 的指數移動平均 m 與平方 Gradient 的移動平均 v，並以 bias correction 修正初期偏差。除以 √v 會讓近期 Gradient 經常很大的座標自動採取較小有效步長。',
      en: 'Adam tracks exponential moving averages of the gradient m and squared gradient v, with bias correction near initialization. Dividing by √v reduces the effective step along coordinates that repeatedly receive large gradients.',
    },
    geometry: {
      zh: '它建立的是 diagonal、歷史相依的縮放，而不是完整 Hessian。若困難主要來自各座標尺度不同，Adam 很有效；若 valley 經旋轉、曲率方向不與座標軸對齊，diagonal scaling 無法完全消除耦合。',
      en: 'It builds a diagonal, history-dependent scaling rather than a full Hessian model. It handles axis-aligned scale differences well, but cannot fully remove coupling when a valley is rotated away from the coordinate axes.',
    },
    convergence: {
      zh: '在 stochastic optimization 中 Adam 常能快速降低初期 loss；但一般 convex 收斂需要更細緻的步長條件或 AMSGrad 類修正。這個實驗是 deterministic，因此主要觀察它的 preconditioning 行為，而非 minibatch noise。',
      en: 'Adam often reduces early loss quickly in stochastic optimization, but general convex convergence requires careful step schedules or variants such as AMSGrad. This lab is deterministic, so it isolates preconditioning rather than minibatch noise.',
    },
    failure: {
      zh: '每步一次 Gradient，另外儲存 m、v 兩個向量。η 太大仍會發散；而 v 的歷史可能使接近 minimum 時有效步長過小，所以「前期快」不必然等於「最後最精準」。',
      en: 'Each step needs one gradient and two state vectors m and v. Large η can still diverge, and historical v can make late-stage effective steps too small, so fast initial progress need not mean the most accurate finish.',
    },
  },
  newton: {
    name: 'Newton Method',
    short: 'Newton',
    formula: String.raw`\mathbf{x}_{k+1}=\mathbf{x}_k-\mathbf H(\mathbf{x}_k)^{-1}\nabla f(\mathbf{x}_k)`,
    uses: { zh: 'Gradient + 完整 Hessian', en: 'Gradient + full Hessian' },
    principle: {
      zh: 'Newton step 是把二階 Taylor model 的 Gradient 設為零所得：它解 Hₖpₖ=−gₖ，而不是單純沿 −gₖ。Hessian inverse 會依每個 principal curvature 重新縮放並旋轉步伐。',
      en: 'The Newton step minimizes the local quadratic Taylor model by solving Hₖpₖ=−gₖ instead of following −gₖ. The inverse Hessian rescales and rotates the step according to principal curvatures.',
    },
    geometry: {
      zh: '對 positive-definite quadratic，精確 Newton 理論上一個 full step 就到 minimum，與 condition number 無關；在一般函數上，靠近 nondegenerate minimum 時局部模型才足夠準確。本站另用 backtracking 避免 loss 上升。',
      en: 'For a positive-definite quadratic, exact Newton reaches the minimizer in one full step regardless of conditioning. For general objectives the quadratic model becomes reliable only near a nondegenerate minimizer; this lab also uses backtracking to reject increasing loss.',
    },
    convergence: {
      zh: '若 Hessian 在解附近 Lipschitz continuous 且 nonsingular，Newton 具有局部 quadratic convergence：誤差大致每步平方。但這是局部結論，不代表從任意起點都安全。',
      en: 'If the Hessian is Lipschitz and nonsingular near the solution, Newton has local quadratic convergence: the error is roughly squared each step. This is a local statement, not a global safety guarantee.',
    },
    failure: {
      zh: '完整 Hessian 的建立與線性系統求解在高維很昂貴。若 Hessian singular 或 indefinite，Newton direction 可能不是 descent direction；本實驗會明確標記 curvature failure，而不是把失敗假裝成收斂。',
      en: 'Forming and solving with a full Hessian is expensive in high dimensions. If it is singular or indefinite, the Newton direction may not descend; this lab explicitly reports curvature failure instead of treating it as convergence.',
    },
  },
  bfgs: {
    name: 'BFGS',
    short: 'BFGS',
    formula: String.raw`\mathbf B_{k+1}^{-1}=\left(\mathbf I-\rho\mathbf s\mathbf y^\top\right)\mathbf B_k^{-1}\left(\mathbf I-\rho\mathbf y\mathbf s^\top\right)+\rho\mathbf s\mathbf s^\top`,
    uses: {
      zh: 'Gradient differences + inverse-Hessian approximation',
      en: 'Gradient differences + inverse-Hessian approximation',
    },
    principle: {
      zh: 'BFGS 不直接計算 Hessian，而用 sₖ=xₖ₊₁−xₖ 與 yₖ=gₖ₊₁−gₖ 更新 inverse-Hessian approximation。更新滿足 secant equation，讓模型逐步學到局部 curvature。',
      en: 'BFGS avoids explicit Hessians. It updates an inverse-Hessian approximation using sₖ=xₖ₊₁−xₖ and yₖ=gₖ₊₁−gₖ, enforcing the secant equation so the model gradually learns local curvature.',
    },
    geometry: {
      zh: '一開始它像經過縮放的 GD；累積足夠的 secant pairs 後，方向會逐漸貼合 valley。只要 yᵀs>0，更新可保持 positive definiteness，因此配合 line search 通常比原始 Newton 更穩健。',
      en: 'It initially resembles scaled GD, then aligns with the valley after collecting secant pairs. When yᵀs>0 the update preserves positive definiteness, making it robust when paired with line search.',
    },
    convergence: {
      zh: '在 smooth strongly convex 問題、適當 line search 與解附近條件成立時，BFGS 可達 superlinear convergence。它通常比 GD 少很多 iterations，但每一步不是同樣昂貴。',
      en: 'For smooth strongly convex objectives with a suitable line search, BFGS can achieve superlinear local convergence. It often needs far fewer iterations than GD, though its iterations are not equally cheap.',
    },
    failure: {
      zh: 'Full BFGS 需儲存 O(n²) 矩陣；line search 也會增加 function evaluations。若 curvature pair 品質差，本站會跳過該次更新並退回較安全的方向，這也是 ledger 中評估次數較高的原因。',
      en: 'Full BFGS stores an O(n²) matrix, and line search adds function evaluations. Poor curvature pairs are skipped in this lab and the method falls back to a safer direction, explaining its higher evaluation count.',
    },
  },
};

const geometryInfo: Record<
  ObjectiveId,
  { name: string; formula: string; concept: LocalText; description: LocalText }
> = {
  quadratic: {
    name: 'Quadratic bowl',
    formula: String.raw`f(\mathbf x)=\tfrac12\mathbf x^\top\mathbf Q\mathbf x,\qquad \kappa(\mathbf Q)=\frac{\lambda_{\max}}{\lambda_{\min}}`,
    concept: { zh: 'Conditioning', en: 'Conditioning' },
    description: {
      zh: 'Q 的 eigenvectors 決定等高線方向，eigenvalues 決定各方向曲率。Condition number κ 越大，谷底越狹長，固定步長越難同時兼顧陡峭與平坦方向。',
      en: 'Eigenvectors of Q set contour directions and eigenvalues set curvature. A larger condition number κ creates a narrower valley, making one fixed step size unsuitable for both steep and flat directions.',
    },
  },
  rosenbrock: {
    name: 'Rosenbrock valley',
    formula: String.raw`f(x,y)=(1-x)^2+100(y-x^2)^2`,
    concept: { zh: 'Curved valley', en: 'Curved valley' },
    description: {
      zh: 'minimum 位在彎曲、狹窄的 valley 中。局部下降方向與通往 minimum 的長程方向並不一致，因此演算法必須一邊下降、一邊反覆修正方向。',
      en: 'The minimizer lies in a narrow curved valley. The local descent direction does not match the long-range direction to the solution, so the optimizer must descend while repeatedly correcting course.',
    },
  },
  himmelblau: {
    name: 'Himmelblau landscape',
    formula: String.raw`f(x,y)=(x^2+y-11)^2+(x+y^2-7)^2`,
    concept: { zh: 'Multiple minima', en: 'Multiple minima' },
    description: {
      zh: '同一個 non-convex landscape 有四個 global minima 與多個 saddle regions。起點與方法會決定 trajectory 進入哪個 attraction basin。',
      en: 'One non-convex landscape contains four global minima and several saddle regions. Initialization and algorithm determine which basin of attraction receives the trajectory.',
    },
  },
};

const presets: {
  id: string;
  name: LocalText;
  note: LocalText;
  config: ExperimentConfig;
}[] = [
  {
    id: 'conditioning',
    name: { zh: '狹長谷底', en: 'Narrow valley' },
    note: {
      zh: '看 GD zig-zag 與 Momentum 的抑震效果',
      en: 'Compare GD zig-zag with momentum damping',
    },
    config: {
      objective: 'quadratic',
      start: [-4, 3.8],
      optimizers: optimizerOrder,
      learningRate: 0.035,
      momentum: 0.9,
      conditionNumber: 55,
      rotation: 32,
      maxIterations: 300,
    },
  },
  {
    id: 'banana',
    name: { zh: '彎曲山谷', en: 'Curved valley' },
    note: {
      zh: '比較 first-order 與 curvature-based methods',
      en: 'Compare first-order and curvature-based methods',
    },
    config: {
      objective: 'rosenbrock',
      start: [-1.35, 1.7],
      optimizers: optimizerOrder,
      learningRate: 0.0015,
      momentum: 0.85,
      conditionNumber: 24,
      rotation: 28,
      maxIterations: 300,
    },
  },
  {
    id: 'basins',
    name: { zh: '多個答案', en: 'Multiple answers' },
    note: {
      zh: '觀察 initialization 如何選擇 attraction basin',
      en: 'See how initialization selects an attraction basin',
    },
    config: {
      objective: 'himmelblau',
      start: [0.3, -0.6],
      optimizers: optimizerOrder,
      learningRate: 0.01,
      momentum: 0.82,
      conditionNumber: 24,
      rotation: 28,
      maxIterations: 300,
    },
  },
];

const statusText: Record<RunStatus, LocalText> = {
  converged: { zh: '已收斂', en: 'Converged' },
  max_iterations: { zh: '達上限', en: 'Max iterations' },
  diverged: { zh: '發散', en: 'Diverged' },
  numerical_failure: { zh: '數值失敗', en: 'Numerical failure' },
  curvature_failure: { zh: '曲率失敗', en: 'Curvature failure' },
};

function local(text: LocalText, lang: Lang) {
  return text[lang];
}

function formatNumber(value: number, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  if (
    Math.abs(value) >= 10000 ||
    (Math.abs(value) > 0 && Math.abs(value) < 0.001)
  )
    return value.toExponential(2);
  return value.toFixed(digits);
}

function makeView(
  objectiveId: ObjectiveId,
  conditionNumber: number,
  rotation: number,
): PlotView {
  const range = createObjective(objectiveId, conditionNumber, rotation).range;
  return { x: [...range.x], y: [...range.y] };
}

function resultTakeaways(
  results: OptimizationResult[],
  config: ExperimentConfig,
  lang: Lang,
) {
  if (results.length === 0) return [];
  const items: {
    title: string;
    text: string;
    tone: 'good' | 'warn' | 'info';
  }[] = [];
  const converged = results.filter((result) => result.converged);
  const newton = results.find((result) => result.optimizer === 'newton');
  const failed = results.filter((result) => !result.converged);

  if (newton?.status === 'curvature_failure') {
    items.push({
      tone: 'warn',
      title: lang === 'zh' ? 'Newton 為什麼沒有跑？' : 'Why did Newton stop?',
      text:
        lang === 'zh'
          ? '目前位置的 Hessian 不是 positive definite，二階 Taylor model 含有向下彎的方向，因此 Newton step 不保證是 descent direction。這是 non-convex geometry 的訊號，不是動畫故障。'
          : 'The Hessian at the current point is not positive definite, so the quadratic model bends downward in some direction and the Newton step is not guaranteed to descend. This is non-convex geometry, not an animation bug.',
    });
  } else if (newton?.status === 'numerical_failure') {
    items.push({
      tone: 'warn',
      title:
        lang === 'zh'
          ? 'Newton 遇到數值問題'
          : 'Newton met a numerical problem',
      text:
        lang === 'zh'
          ? 'Hessian 接近 singular，反矩陣會放大誤差，因此實驗停止。實務上可使用 damping、trust region 或 modified Cholesky。'
          : 'The Hessian became nearly singular, so inversion would amplify error. Practical remedies include damping, trust regions, or modified Cholesky.',
    });
  }

  if (converged.length > 0) {
    const fastest = [...converged].sort(
      (a, b) => a.iterations - b.iterations,
    )[0];
    items.push({
      tone: 'good',
      title:
        lang === 'zh'
          ? `最少 iterations：${optimizerInfo[fastest.optimizer].short}`
          : `Fewest iterations: ${optimizerInfo[fastest.optimizer].short}`,
      text:
        lang === 'zh'
          ? `${fastest.iterations} 步達到停止條件，但「步數少」不等於「計算最便宜」：它用了 ${fastest.functionEvaluations} 次 function、${fastest.gradientEvaluations} 次 gradient、${fastest.hessianEvaluations} 次 Hessian 評估。`
          : `It met the stopping rule in ${fastest.iterations} steps, but fewer steps do not always mean lower cost: it used ${fastest.functionEvaluations} function, ${fastest.gradientEvaluations} gradient, and ${fastest.hessianEvaluations} Hessian evaluations.`,
    });
  }

  if (failed.some((result) => result.status === 'diverged')) {
    const names = failed
      .filter((result) => result.status === 'diverged')
      .map((result) => optimizerInfo[result.optimizer].short)
      .join(', ');
    items.push({
      tone: 'warn',
      title: lang === 'zh' ? `${names} 發散` : `${names} diverged`,
      text:
        lang === 'zh'
          ? `目前 Learning rate=${config.learningRate} 對這個 landscape 太積極；高曲率方向會把誤差放大。先把 Learning rate 降低，再判斷演算法本身。`
          : `Learning rate=${config.learningRate} is too aggressive for this landscape; high-curvature directions amplify error. Lower it before judging the algorithm itself.`,
    });
  }

  const capped = failed.filter((result) => result.status === 'max_iterations');
  if (capped.length > 0) {
    items.push({
      tone: 'info',
      title:
        lang === 'zh'
          ? '達到 Max iterations 不等於發散'
          : 'Max iterations does not mean divergence',
      text:
        lang === 'zh'
          ? `${capped.map((result) => optimizerInfo[result.optimizer].short).join(', ')} 在 ${config.maxIterations ?? 300} 步內尚未讓 ‖∇f‖ < 10⁻⁵。路徑若仍向下，可增加上限；若震盪，則應先調低步長。`
          : `${capped.map((result) => optimizerInfo[result.optimizer].short).join(', ')} did not reach ‖∇f‖ < 10⁻⁵ within ${config.maxIterations ?? 300} steps. If loss still falls, raise the cap; if it oscillates, reduce the step size first.`,
    });
  }

  if (config.objective === 'quadratic') {
    items.push({
      tone: 'info',
      title:
        lang === 'zh'
          ? `Condition number κ = ${config.conditionNumber}`
          : `Condition number κ = ${config.conditionNumber}`,
      text:
        lang === 'zh'
          ? 'κ 衡量最陡與最平方向的曲率比。把 κ 調高後再跑一次，觀察 GD 橫向震盪增加，而能估計或累積幾何資訊的方法受影響較小。'
          : 'κ is the ratio between the steepest and flattest curvature. Increase it and rerun: GD should oscillate more across the valley, while methods that accumulate or estimate geometry are less affected.',
    });
  }

  if (config.objective === 'himmelblau' && converged.length > 1) {
    const basins = new Set(
      converged.map((result) => {
        const objective = createObjective('himmelblau');
        let best = 0;
        let distance = Number.POSITIVE_INFINITY;
        objective.minima.forEach((minimum, index) => {
          const next = Math.hypot(
            result.finalPosition[0] - minimum[0],
            result.finalPosition[1] - minimum[1],
          );
          if (next < distance) {
            distance = next;
            best = index;
          }
        });
        return best;
      }),
    );
    items.push({
      tone: 'info',
      title:
        lang === 'zh'
          ? 'Initialization 選擇了 attraction basin'
          : 'Initialization selected the attraction basin',
      text:
        lang === 'zh'
          ? `這次收斂的路徑落入 ${basins.size} 個不同 basin。移動起點再執行，能直接看到 non-convex 問題為何沒有唯一的全域路徑。`
          : `The converged paths entered ${basins.size} distinct basin(s). Move the start and rerun to see why a non-convex problem has no unique global route.`,
    });
  }

  return items.slice(0, 5);
}

export function OptimizationLab() {
  const [lang, setLang] = useState<Lang>('zh');
  const [objectiveId, setObjectiveId] = useState<ObjectiveId>('quadratic');
  const [start, setStart] = useState<Point>([-4, 3.8]);
  const [selected, setSelected] = useState<OptimizerId[]>(optimizerOrder);
  const [learningRate, setLearningRate] = useState(0.035);
  const [momentum, setMomentum] = useState(0.9);
  const [conditionNumber, setConditionNumber] = useState(55);
  const [rotation, setRotation] = useState(32);
  const [maxIterations, setMaxIterations] = useState(300);
  const [plotView, setPlotView] = useState<PlotView>(() =>
    makeView('quadratic', 55, 32),
  );
  const [results, setResults] = useState<OptimizationResult[]>([]);
  const [animationTick, setAnimationTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [logScale, setLogScale] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [explanation, setExplanation] = useState<OptimizerId>('gd');
  const demoStageRef = useRef<HTMLDivElement>(null);
  const learningRef = useRef<HTMLElement>(null);

  const objective = useMemo(
    () => createObjective(objectiveId, conditionNumber, rotation),
    [objectiveId, conditionNumber, rotation],
  );

  const config = useMemo<ExperimentConfig>(
    () => ({
      objective: objectiveId,
      start,
      optimizers: selected,
      learningRate,
      momentum,
      conditionNumber,
      rotation,
      maxIterations,
    }),
    [
      objectiveId,
      start,
      selected,
      learningRate,
      momentum,
      conditionNumber,
      rotation,
      maxIterations,
    ],
  );

  const maxDisplay = Math.max(1, ...results.map(getDisplaySpan));
  const completed =
    results.length > 0 && (showAll || animationTick >= maxDisplay);
  const currentTimelineStep = Math.round(
    showAll ? maxDisplay : animationTick,
  );
  const takeaways = useMemo(
    () => resultTakeaways(results, config, lang),
    [results, config, lang],
  );

  const markDirty = () => {
    setDirty(true);
    setPlaying(false);
    setCountdown(null);
  };

  const seekToStep = (step: number) => {
    if (!Number.isFinite(step)) return;
    const nextStep = Math.min(maxDisplay, Math.max(0, Math.round(step)));
    setAnimationTick(nextStep);
    setShowAll(nextStep >= maxDisplay);
    setPlaying(false);
    setCountdown(null);
  };

  const updateStart = (point: Point) => {
    setStart([
      Math.max(objective.range.x[0], Math.min(objective.range.x[1], point[0])),
      Math.max(objective.range.y[0], Math.min(objective.range.y[1], point[1])),
    ]);
    markDirty();
  };

  const selectObjective = (id: ObjectiveId) => {
    setObjectiveId(id);
    setPlotView(makeView(id, conditionNumber, rotation));
    markDirty();
  };

  const loadPreset = (preset: (typeof presets)[number]) => {
    const next = preset.config;
    setObjectiveId(next.objective);
    setStart(next.start);
    setSelected(next.optimizers);
    setLearningRate(next.learningRate);
    setMomentum(next.momentum);
    setConditionNumber(next.conditionNumber);
    setRotation(next.rotation);
    setMaxIterations(next.maxIterations ?? 300);
    setPlotView(makeView(next.objective, next.conditionNumber, next.rotation));
    setResults([]);
    setPlaying(false);
    setCountdown(null);
    setDirty(false);
  };

  const runExperiment = () => {
    if (selected.length === 0) return;
    const nextResults = runComparison(config);
    setResults(nextResults);
    setAnimationTick(0);
    setShowAll(false);
    setPlaying(false);
    setCountdown(3);
    setDirty(false);
    window.setTimeout(() => {
      demoStageRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 80);
  };

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        setPlaying(true);
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!playing || showAll || results.length === 0) return;
    let frame = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      setAnimationTick((current) => {
        const next = current + elapsed * 40 * speed;
        if (next >= maxDisplay) {
          setPlaying(false);
          return maxDisplay;
        }
        return next;
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, showAll, results, speed, maxDisplay]);

  useEffect(() => {
    if (!document.modelContext) return;
    const controller = new AbortController();
    void document.modelContext.registerTool(
      {
        name: 'run_optimization_comparison',
        title: 'Run optimization comparison',
        description:
          'Run local optimizer trajectories on one of the lab objective functions.',
        inputSchema: {
          type: 'object',
          properties: {
            objective: {
              type: 'string',
              enum: ['quadratic', 'rosenbrock', 'himmelblau'],
            },
            start: {
              type: 'array',
              minItems: 2,
              maxItems: 2,
              items: { type: 'number' },
            },
            optimizers: {
              type: 'array',
              items: { type: 'string', enum: optimizerOrder },
            },
            learningRate: { type: 'number', exclusiveMinimum: 0 },
            momentum: { type: 'number', minimum: 0, maximum: 0.999 },
            conditionNumber: { type: 'number', minimum: 1, maximum: 100 },
            rotation: { type: 'number', minimum: 0, maximum: 90 },
            maxIterations: { type: 'integer', minimum: 10, maximum: 2000 },
          },
          required: ['objective', 'start', 'optimizers', 'learningRate'],
        },
        annotations: { readOnlyHint: true },
        execute(input) {
          const provided = input as Partial<ExperimentConfig>;
          return runComparison({ ...config, ...provided });
        },
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [config]);

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <a
              href="#top"
              aria-label="Optimization Visual Lab home"
              className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <Image
                src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/rozias-logo.png`}
                alt="Rozias"
                width="48"
                height="48"
                className="size-12 rounded-full border border-slate-300 object-cover shadow-sm"
              />
            </a>
            <a
              href="https://rozias0925.github.io/Rozias-Website/"
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 sm:inline-flex"
              aria-label="Open Researcher Profile in a new tab"
            >
              <ExternalLink className="size-4" />
              Researcher Profile
            </a>
            <a
              href="#top"
              className="hidden font-semibold tracking-tight text-slate-950 transition hover:text-teal-800 md:inline"
            >
              Optimization Visual Lab
            </a>
          </div>
          <div className="flex items-center gap-3">
            <fieldset
              className="flex rounded-lg border border-slate-200 bg-slate-50 p-1"
              aria-label="Language switcher"
            >
              <Button
                size="sm"
                variant={lang === 'zh' ? 'default' : 'ghost'}
                aria-pressed={lang === 'zh'}
                onClick={() => setLang('zh')}
                className="h-8 px-3"
              >
                中文
              </Button>
              <Button
                size="sm"
                variant={lang === 'en' ? 'default' : 'ghost'}
                aria-pressed={lang === 'en'}
                onClick={() => setLang('en')}
                className="h-8 px-3"
              >
                English
              </Button>
            </fieldset>
          </div>
        </div>
      </header>

      <section
        id="top"
        className="px-4 pb-14 pt-14 sm:px-6 lg:px-8 lg:pb-20 lg:pt-20"
      >
        <div className="mx-auto max-w-6xl">
          <Badge
            variant="outline"
            className="border-teal-200 bg-teal-50 text-teal-800"
          >
            Interactive numerical optimization
          </Badge>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
            Optimization Visual Lab
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            {lang === 'zh'
              ? '先設定一個 loss surface 與起點，再觀看不同 optimizer 如何移動，最後用數學把路徑、收斂與失敗原因連起來。'
              : 'Configure a loss surface and starting point, watch optimizers move, then connect every trajectory, convergence result, and failure to the mathematics behind it.'}
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <JourneyStep
              number="1."
              title={lang === 'zh' ? '設定實驗參數' : 'Configure experiment'}
              text={
                lang === 'zh'
                  ? '選擇 landscape、起點、方法與 hyperparameters。'
                  : 'Choose the landscape, start, methods, and hyperparameters.'
              }
            />
            <JourneyStep
              number="2."
              title={lang === 'zh' ? '觀看收斂路徑' : 'Watch convergence paths'}
              text={
                lang === 'zh'
                  ? '倒數三秒後，比較 trajectory 與 loss curve。'
                  : 'After a three-second countdown, compare trajectories and loss curves.'
              }
            />
            <JourneyStep
              number="3."
              title={
                lang === 'zh' ? '了解演算法原理' : 'Understand the algorithms'
              }
              text={
                lang === 'zh'
                  ? '從 Gradient、Hessian 與 geometry 解釋結果。'
                  : 'Explain the outcome through gradients, Hessians, and geometry.'
              }
            />
          </div>
        </div>
      </section>

      <section
        id="setup"
        className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-[1500px]">
          <SectionHeading
            number=""
            eyebrow=""
            title={
              lang === 'zh' ? '一. 設定實驗參數' : '1. Configure experiment'
            }
            description={
              lang === 'zh'
                ? '選擇 loss surface、起始位置與 optimizer 參數；執行後會自動移到動畫中央並倒數三秒。'
                : 'Choose a loss surface, starting point, and optimizer settings. The animation will be centered before a three-second countdown.'
            }
          />

          <div className="mt-10 rounded-2xl border border-teal-200 bg-teal-50/70 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 size-5 shrink-0 text-teal-700" />
              <div>
                <h3 className="font-semibold text-teal-950">
                  {lang === 'zh'
                    ? '不知道怎麼選？先載入一組實驗'
                    : 'Not sure what to choose? Load an experiment'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-teal-800">
                  {lang === 'zh'
                    ? 'Preset 只會填入參數，仍由你決定何時執行。'
                    : 'A preset only fills the controls; you still decide when to run it.'}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className="rounded-xl border border-teal-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-sm"
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {local(preset.name, lang)}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-500">
                    {local(preset.note, lang)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)] xl:items-stretch">
            <div className="grid gap-6">
              <SetupCard
                title={lang === 'zh' ? '一、Loss surface' : '1. Loss surface'}
                description={
                  lang === 'zh'
                    ? '選擇問題的幾何結構。'
                    : 'Choose the geometry of the problem.'
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    ['quadratic', 'rosenbrock', 'himmelblau'] as ObjectiveId[]
                  ).map((id) => (
                    <button
                      key={id}
                      onClick={() => selectObjective(id)}
                      className={`rounded-xl border p-4 text-left transition ${objectiveId === id ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                    >
                      <span className="block text-sm font-semibold text-slate-900">
                        {geometryInfo[id].name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {local(geometryInfo[id].concept, lang)}
                      </span>
                    </button>
                  ))}
                </div>
                {objectiveId === 'quadratic' && (
                  <div className="mt-7 grid gap-6 sm:grid-cols-2">
                    <ControlSlider
                      label="Condition number κ"
                      value={conditionNumber}
                      display={String(conditionNumber)}
                      min={1}
                      max={100}
                      step={1}
                      onChange={(value) => {
                        setConditionNumber(value);
                        markDirty();
                      }}
                    />
                    <ControlSlider
                      label={lang === 'zh' ? '旋轉角度' : 'Rotation'}
                      value={rotation}
                      display={`${rotation}°`}
                      min={0}
                      max={90}
                      step={1}
                      onChange={(value) => {
                        setRotation(value);
                        markDirty();
                      }}
                    />
                  </div>
                )}
              </SetupCard>

              <SetupCard
                title={
                  lang === 'zh'
                    ? '二、Optimizer 與參數'
                    : '2. Optimizers and parameters'
                }
                description={
                  lang === 'zh'
                    ? '勾選要同時比較的方法；Max iterations 是安全上限，不是強迫每個方法都跑滿。'
                    : 'Choose methods to compare. Max iterations is a safety cap, not a required run length.'
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {optimizerOrder.map((id) => (
                    <label
                      key={id}
                      className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${selected.includes(id) ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white text-slate-400'}`}
                    >
                      <Checkbox
                        checked={selected.includes(id)}
                        onCheckedChange={(checked) => {
                          setSelected((current) =>
                            checked
                              ? [...current, id].sort(
                                  (a, b) =>
                                    optimizerOrder.indexOf(a) -
                                    optimizerOrder.indexOf(b),
                                )
                              : current.filter((item) => item !== id),
                          );
                          markDirty();
                        }}
                      />
                      <span className="whitespace-nowrap text-sm font-medium">
                        {optimizerInfo[id].short}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-7 grid gap-6 sm:grid-cols-2">
                  <ControlSlider
                    label="Learning rate η"
                    value={learningRate}
                    display={String(learningRate)}
                    min={0.0005}
                    max={0.1}
                    step={0.0005}
                    onChange={(value) => {
                      setLearningRate(Number(value.toFixed(4)));
                      markDirty();
                    }}
                  />
                  <ControlSlider
                    label="Momentum β"
                    value={momentum}
                    display={momentum.toFixed(2)}
                    min={0}
                    max={0.99}
                    step={0.01}
                    onChange={(value) => {
                      setMomentum(value);
                      markDirty();
                    }}
                  />
                  <div>
                    <Label
                      htmlFor="max-iterations"
                      className="text-sm text-slate-700"
                    >
                      Max iterations
                    </Label>
                    <Input
                      id="max-iterations"
                      type="number"
                      min={10}
                      max={2000}
                      step={10}
                      value={maxIterations}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setMaxIterations(
                          Math.max(
                            10,
                            Math.min(
                              2000,
                              Number.isFinite(value) ? value : 300,
                            ),
                          ),
                        );
                        markDirty();
                      }}
                      className="mt-2 h-11"
                    />
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {lang === 'zh'
                        ? '預設 300；收斂後會提早停止。'
                        : 'Default 300; a converged method stops early.'}
                    </p>
                  </div>
                  <div>
                    <span
                      className="block select-none text-sm text-transparent"
                      aria-hidden="true"
                    >
                      Action
                    </span>
                    <Button
                      size="lg"
                      disabled={selected.length === 0}
                      onClick={runExperiment}
                      className="mt-2 h-11 w-full bg-teal-700 text-white hover:bg-teal-800"
                    >
                      <Play data-icon="inline-start" />
                      {lang === 'zh' ? '執行實驗' : 'Run experiment'}
                    </Button>
                    {selected.length === 0 && (
                      <p className="mt-2 text-sm text-rose-600">
                        {lang === 'zh'
                          ? '請至少選擇一個 optimizer。'
                          : 'Select at least one optimizer.'}
                      </p>
                    )}
                  </div>
                </div>
              </SetupCard>
            </div>

            <SetupCard
              title={
                lang === 'zh'
                  ? '三、在圖上選起點'
                  : '3. Choose a starting point'
              }
              description={
                lang === 'zh'
                  ? '按住 Ctrl 再滑鼠滾輪縮放，點擊放置黑點；每個方向的格線間距都是 1。'
                  : 'Hold Ctrl while using the mouse wheel to zoom, then click to place the black point. Grid spacing is 1 unit on both axes.'
              }
              icon={<Crosshair className="size-5 text-teal-700" />}
              className="h-full"
            >
              <div className="mx-auto max-w-[680px]">
                <SurfacePlot
                  objective={objective}
                  results={[]}
                  start={start}
                  animationTick={0}
                  showAll
                  view={plotView}
                  onViewChange={setPlotView}
                  onStartChange={updateStart}
                  ariaLabel={
                    lang === 'zh'
                      ? 'Loss surface 熱力圖。按住 Ctrl 並滾輪縮放，點擊選擇起點。'
                      : 'Loss surface heatmap. Hold Ctrl and scroll to zoom, then click to select the starting point.'
                  }
                />
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <CoordinateInput
                    label="x₁"
                    value={start[0]}
                    onChange={(value) => updateStart([value, start[1]])}
                  />
                  <CoordinateInput
                    label="x₂"
                    value={start[1]}
                    onChange={(value) => updateStart([start[0], value])}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    setPlotView(
                      makeView(objectiveId, conditionNumber, rotation),
                    )
                  }
                >
                  <Maximize2 data-icon="inline-start" />
                  {lang === 'zh' ? '重設縮放' : 'Reset zoom'}
                </Button>
              </div>
            </SetupCard>
          </div>
        </div>
      </section>

      <section id="watch" className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[1500px]">
          <SectionHeading
            number=""
            eyebrow=""
            title={
              lang === 'zh' ? '二. 觀看收斂路徑' : '2. Watch convergence paths'
            }
            description={
              lang === 'zh'
                ? '熱力圖顯示 loss 高低，等高線顯示局部幾何；彩色路徑是 optimizer 實際走過的位置。'
                : 'The heatmap shows loss magnitude, contours show local geometry, and colored lines show the actual optimizer trajectories.'
            }
          />

          <div className="scroll-mt-20 mt-10 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_70px_rgba(15,23,42,.08)] sm:p-7">
            {results.length === 0 ? (
              <div className="grid min-h-[520px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div>
                  <Play className="mx-auto size-8 text-slate-400" />
                  <p className="mt-4 text-lg font-medium">
                    {lang === 'zh'
                      ? '動畫會在這裡播放'
                      : 'The animation will play here'}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {lang === 'zh'
                      ? '在上方完成設定並按下「執行實驗」。'
                      : 'Configure the experiment above and press “Run experiment”.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div
                  ref={demoStageRef}
                  className="grid scroll-mt-20 gap-4 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)_minmax(0,1fr)] xl:items-stretch"
                >
                  <div className="relative mx-auto w-full max-w-[min(520px,78vh)] xl:mx-0">
                    <SurfacePlot
                      objective={objective}
                      results={results}
                      start={start}
                      animationTick={animationTick}
                      showAll={showAll}
                      interactive={false}
                      view={plotView}
                      ariaLabel={
                        lang === 'zh'
                          ? '顯示 optimizer 收斂路徑的 loss surface 熱力圖。'
                          : 'Loss surface heatmap with optimizer convergence trajectories.'
                      }
                    />
                    {countdown !== null && (
                      <div
                        className="absolute inset-0 grid place-items-center rounded-2xl bg-white/72 backdrop-blur-sm"
                        aria-live="assertive"
                      >
                        <div className="grid size-28 place-items-center rounded-full border-4 border-teal-600 bg-white text-5xl font-semibold text-teal-800 shadow-xl">
                          {countdown}
                        </div>
                      </div>
                    )}
                  </div>
                  <aside className="grid gap-4 sm:grid-cols-2 xl:contents">
                    <div className="h-full rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {lang === 'zh' ? '目前進度' : 'Current progress'}
                      </p>
                      <Progress
                        value={
                          showAll
                            ? 100
                            : Math.min(100, (animationTick / maxDisplay) * 100)
                        }
                        className="mt-4"
                      />
                      <div className="mt-6 space-y-4">
                        {results.map((result) => (
                          <div
                            key={result.optimizer}
                            className="flex items-center justify-between gap-4 text-sm"
                          >
                            <span className="flex items-center gap-2 font-medium">
                              <span
                                className="size-2.5 rounded-full ring-1 ring-inset ring-slate-400/60"
                                style={{
                                  backgroundColor:
                                    OPTIMIZER_COLORS[result.optimizer],
                                }}
                              />
                              {optimizerInfo[result.optimizer].short}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              {lang === 'zh' ? '第' : ''}{' '}
                              {Math.round(
                                getVisibleStep(result, animationTick, showAll),
                              )}{' '}
                              {lang === 'zh' ? '步' : 'steps'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {lang === 'zh' ? '播放控制' : 'Playback controls'}
                      </p>
                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setPlaying((value) => !value)}
                          disabled={completed || countdown !== null}
                        >
                          {playing ? (
                            <Pause data-icon="inline-start" />
                          ) : (
                            <Play data-icon="inline-start" />
                          )}
                          {playing
                            ? lang === 'zh'
                              ? '暫停'
                              : 'Pause'
                            : lang === 'zh'
                              ? '播放'
                              : 'Play'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setAnimationTick(0);
                            setShowAll(false);
                            setCountdown(3);
                            setPlaying(false);
                          }}
                        >
                          <RotateCcw data-icon="inline-start" />
                          {lang === 'zh' ? '重播' : 'Replay'}
                        </Button>
                        <Button
                          variant="outline"
                          className="col-span-2"
                          onClick={() => {
                            setShowAll(true);
                            setPlaying(false);
                          }}
                        >
                          {lang === 'zh' ? '看完整路徑' : 'Show full path'}
                        </Button>
                      </div>
                      <div className="mt-5 border-t border-slate-200 pt-5">
                        <Label
                          htmlFor="timeline-step"
                          className="text-xs font-medium text-slate-500"
                        >
                          {lang === 'zh' ? '回到第幾步' : 'Go to step'}
                        </Label>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={
                              lang === 'zh' ? '前一步' : 'Previous step'
                            }
                            disabled={currentTimelineStep <= 0}
                            onClick={() =>
                              seekToStep(currentTimelineStep - 1)
                            }
                          >
                            <ChevronLeft />
                          </Button>
                          <Input
                            id="timeline-step"
                            type="number"
                            min={0}
                            max={maxDisplay}
                            step={1}
                            value={currentTimelineStep}
                            aria-label={
                              lang === 'zh'
                                ? `回到第幾步，最多 ${maxDisplay} 步`
                                : `Go to step, maximum ${maxDisplay}`
                            }
                            className="min-w-0 text-center font-mono tabular-nums"
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) =>
                              seekToStep(event.currentTarget.valueAsNumber)
                            }
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={lang === 'zh' ? '後一步' : 'Next step'}
                            disabled={currentTimelineStep >= maxDisplay}
                            onClick={() =>
                              seekToStep(currentTimelineStep + 1)
                            }
                          >
                            <ChevronRight />
                          </Button>
                        </div>
                        <p className="mt-2 text-right text-xs text-slate-400">
                          {lang === 'zh'
                            ? `共 ${maxDisplay} 步`
                            : `${maxDisplay} steps total`}
                        </p>
                      </div>
                      <div className="mt-auto pt-5">
                        <p className="text-xs font-medium text-slate-500">
                          {lang === 'zh' ? '動畫速度' : 'Animation speed'}
                        </p>
                        <Select
                          value={String(speed)}
                          onValueChange={(value) => setSpeed(Number(value))}
                        >
                          <SelectTrigger
                            aria-label={
                              lang === 'zh' ? '動畫速度' : 'Animation speed'
                            }
                            className="mt-2 w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.5">0.5×</SelectItem>
                            <SelectItem value="1">1×</SelectItem>
                            <SelectItem value="1.5">1.5×</SelectItem>
                            <SelectItem value="2">2×</SelectItem>
                            <SelectItem value="2.5">2.5×</SelectItem>
                            <SelectItem value="3">3×</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {dirty && (
                        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                          {lang === 'zh'
                            ? '上方參數已改變；請重新執行以更新結果。'
                            : 'Parameters changed above; rerun to update the results.'}
                        </p>
                      )}
                    </div>
                  </aside>
                </div>

                <div className="mt-7 rounded-2xl border border-slate-200 p-4 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Loss vs. iteration</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {lang === 'zh'
                          ? '越快向下、越早變平，代表越快接近停止條件。'
                          : 'Earlier, steeper descent usually means faster progress toward the stopping rule.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Checkbox
                        id="log-scale"
                        checked={logScale}
                        onCheckedChange={(checked) =>
                          setLogScale(Boolean(checked))
                        }
                      />
                      <Label htmlFor="log-scale">Log scale</Label>
                    </div>
                  </div>
                  <LossPlot
                    results={results}
                    animationTick={animationTick}
                    showAll={showAll}
                    logScale={logScale}
                    ariaLabel={
                      lang === 'zh'
                        ? 'Loss 對 iteration 的折線圖。'
                        : 'Loss versus iteration line chart.'
                    }
                  />
                </div>

                {completed && (
                  <div className="mt-7 flex flex-col items-center rounded-2xl bg-emerald-50 p-7 text-center">
                    <span className="grid size-10 place-items-center rounded-full bg-emerald-600 text-white">
                      <Check className="size-5" />
                    </span>
                    <h3 className="mt-4 text-xl font-semibold">
                      {lang === 'zh' ? '演示完成' : 'Animation complete'}
                    </h3>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                      {lang === 'zh'
                        ? '下面的內容會根據這次結果解釋成功、變慢或失敗的原因。'
                        : 'The material below now explains success, slow progress, and failure using this run.'}
                    </p>
                    <Button
                      onClick={() =>
                        learningRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }
                      className="mt-5 bg-emerald-700 hover:bg-emerald-800"
                    >
                      {lang === 'zh' ? '往下理解原理' : 'Understand the result'}
                      <ArrowDown data-icon="inline-end" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section
        ref={learningRef}
        id="learn"
        className="scroll-mt-16 border-t border-slate-200 bg-white px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-[1500px]">
          <SectionHeading
            number=""
            eyebrow=""
            title={
              lang === 'zh'
                ? '三. 了解演算法原理'
                : '3. Understand the algorithms'
            }
            description={
              lang === 'zh'
                ? '先讀取這次 run 的診斷，再比較 evaluation cost、landscape geometry 與每個方法的假設。'
                : 'Start with diagnostics from this run, then compare evaluation cost, landscape geometry, and algorithmic assumptions.'
            }
          />

          <div className="mt-10">
            <h3 className="text-lg font-semibold">
              {lang === 'zh'
                ? '這次實驗的 Result ledger'
                : 'Result ledger for this experiment'}
            </h3>
            {results.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {results.map((result) => (
                  <ResultCard
                    key={result.optimizer}
                    result={result}
                    lang={lang}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
                {lang === 'zh'
                  ? '執行後，這裡會顯示 iterations、評估成本與 final loss。'
                  : 'Run an experiment to see iterations, evaluation cost, and final loss.'}
              </div>
            )}
          </div>

          <div className="mt-16 rounded-3xl border border-indigo-200 bg-indigo-50/60 p-6 sm:p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">
              <Sparkles className="size-4" />
              {lang === 'zh'
                ? '根據本次結果產生的 TAKEAWAYS'
                : 'TAKEAWAYS FROM THIS RUN'}
            </div>
            {takeaways.length > 0 ? (
              <div className="mt-7 grid gap-4 lg:grid-cols-2">
                {takeaways.map((item, index) => (
                  <article
                    key={`${item.title}-${index}`}
                    className="rounded-2xl border border-indigo-100 bg-white p-5"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 size-2.5 shrink-0 rounded-full ${item.tone === 'good' ? 'bg-emerald-500' : item.tone === 'warn' ? 'bg-amber-500' : 'bg-indigo-500'}`}
                      />
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {item.title}
                        </h4>
                        <p className="mt-2 text-sm leading-7 text-slate-600">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-indigo-800">
                {lang === 'zh'
                  ? '先執行一組實驗，這裡不會顯示固定結論，而會讀取實際結果。'
                  : 'Run an experiment first. This section reads the actual result instead of showing generic conclusions.'}
              </p>
            )}
          </div>

          <div className="mt-20 grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                Geometry
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {lang === 'zh'
                  ? '為什麼 landscape 會改變路徑？'
                  : 'Why does the landscape change the path?'}
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600">
                {local(geometryInfo[objectiveId].description, lang)}
              </p>
              <div className="mt-6 overflow-x-auto rounded-2xl border border-teal-200 bg-teal-50 p-5">
                <MathFormula display className="text-lg text-slate-900">
                  {geometryInfo[objectiveId].formula}
                </MathFormula>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {(['quadratic', 'rosenbrock', 'himmelblau'] as ObjectiveId[]).map(
                (id, index) => {
                  const item = geometryInfo[id];
                  return (
                    <article
                      key={id}
                      className={`rounded-2xl border p-5 ${objectiveId === id ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <span className="font-mono text-xs text-slate-400">
                        {['一', '二', '三'][index]}
                      </span>
                      <p className="mt-7 text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
                        {local(item.concept, lang)}
                      </p>
                      <h3 className="mt-2 font-semibold">{item.name}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {local(item.description, lang)}
                      </p>
                    </article>
                  );
                },
              )}
            </div>
          </div>

          <div className="mt-20">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
              Optimizers
            </p>
            <Tabs
              value={explanation}
              onValueChange={(value) => setExplanation(value as OptimizerId)}
              className="mt-5"
            >
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1.5">
                {optimizerOrder.map((id) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="h-10 flex-none px-4"
                  >
                    {optimizerInfo[id].short}
                  </TabsTrigger>
                ))}
              </TabsList>
              {optimizerOrder.map((id) => {
                const info = optimizerInfo[id];
                return (
                  <TabsContent
                    key={id}
                    value={id}
                    className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-9"
                  >
                    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                      <div>
                        <div className="flex items-center gap-3">
                          <span
                            className="size-3 rounded-full ring-1 ring-inset ring-slate-400/60"
                            style={{ backgroundColor: OPTIMIZER_COLORS[id] }}
                          />
                          <h3 className="text-2xl font-semibold">
                            {info.name}
                          </h3>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="w-fit border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600"
                      >
                        {local(info.uses, lang)}
                      </Badge>
                    </div>
                    <div className="mt-6 grid gap-4 lg:grid-cols-2">
                      <div className="flex min-h-64 items-center overflow-x-auto rounded-2xl border border-slate-200 bg-white px-5 py-5">
                        <MathFormula
                          display
                          className="w-full text-lg text-slate-950"
                        >
                          {info.formula}
                        </MathFormula>
                      </div>
                      <OptimizerMotionGraphic optimizer={id} lang={lang} />
                    </div>
                    <div className="mt-8 grid gap-x-9 gap-y-8 lg:grid-cols-2">
                      <ExplanationPoint
                        label={
                          lang === 'zh'
                            ? '更新規則與局部模型'
                            : 'Update rule and local model'
                        }
                        text={local(info.principle, lang)}
                      />
                      <ExplanationPoint
                        label={
                          lang === 'zh'
                            ? '幾何解讀'
                            : 'Geometric interpretation'
                        }
                        text={local(info.geometry, lang)}
                      />
                      <ExplanationPoint
                        label={
                          lang === 'zh'
                            ? '收斂與假設'
                            : 'Convergence and assumptions'
                        }
                        text={local(info.convergence, lang)}
                      />
                      <ExplanationPoint
                        label={
                          lang === 'zh'
                            ? '計算成本與失敗模式'
                            : 'Cost and failure modes'
                        }
                        text={local(info.failure, lang)}
                      />
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Optimization Visual Lab ·{' '}
        {lang === 'zh'
          ? '互動式數值最佳化實驗'
          : 'Interactive numerical optimization'}
      </footer>
    </main>
  );
}

function JourneyStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="font-serif text-xl text-teal-700">{number}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <p className="mt-5 text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function SectionHeading({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:gap-12">
      <div>
        {(number || eyebrow) && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            <span
              className={`${eyebrow ? 'mr-2' : ''} font-serif text-lg normal-case`}
            >
              {number}
            </span>
            {eyebrow}
          </p>
        )}
        <h2
          className={`${number || eyebrow ? 'mt-3' : ''} text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl`}
        >
          {title}
        </h2>
      </div>
      {description && (
        <p className="max-w-3xl text-base leading-7 text-slate-600 lg:whitespace-nowrap">
          {description}
        </p>
      )}
    </div>
  );
}

function SetupCard({
  title,
  description,
  icon,
  className = '',
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {icon}
      </div>
      {children}
    </div>
  );
}

function CoordinateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-slate-500">
        {label}
      </span>
      <Input
        aria-label={`Starting ${label} coordinate`}
        type="number"
        step="0.1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 bg-white pl-10 font-mono"
      />
    </label>
  );
}

function ControlSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-mono text-xs font-semibold text-teal-700">
          {display}
        </span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) =>
          onChange(Number(Array.isArray(next) ? next[0] : next))
        }
        className="[&_[data-slot=slider-range]]:bg-teal-700 [&_[data-slot=slider-thumb]]:border-teal-700"
      />
    </div>
  );
}

function ExplanationPoint({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-violet-700">
        {label}
      </p>
      <p className="mt-3 text-base leading-8 text-slate-700">{text}</p>
    </div>
  );
}

const optimizerMotion: Record<
  OptimizerId,
  { path: string; caption: LocalText; duration: string }
> = {
  gd: {
    path: 'M 35 42 L 80 178 L 122 58 L 163 160 L 202 72 L 238 143 L 270 88 L 300 125 L 326 103',
    caption: {
      zh: '負 Gradient 在狹長谷底中反覆橫切。',
      en: 'The negative gradient repeatedly crosses a narrow valley.',
    },
    duration: '5.2s',
  },
  momentum: {
    path: 'M 35 42 C 76 175 115 177 145 119 C 174 64 210 64 240 105 C 264 137 294 133 326 108',
    caption: {
      zh: '歷史速度逐漸抵銷橫向震盪。',
      en: 'Accumulated velocity gradually damps transverse oscillation.',
    },
    duration: '4.8s',
  },
  adam: {
    path: 'M 35 42 L 72 82 L 96 132 L 132 149 L 168 124 L 198 91 L 232 84 L 258 105 L 286 119 L 326 108',
    caption: {
      zh: '座標別的有效步長持續重新縮放方向。',
      en: 'Coordinate-wise effective steps continually rescale the direction.',
    },
    duration: '4.6s',
  },
  newton: {
    path: 'M 35 42 L 206 145 L 292 101 L 326 108',
    caption: {
      zh: 'Hessian 旋轉並縮放步伐，快速對準局部 minimum。',
      en: 'The Hessian rotates and rescales steps toward the local minimum.',
    },
    duration: '4s',
  },
  bfgs: {
    path: 'M 35 42 C 96 147 129 166 177 129 C 218 97 254 91 281 105 C 297 113 310 112 326 108',
    caption: {
      zh: 'Secant pairs 讓路徑逐步學會局部曲率。',
      en: 'Secant pairs let the path gradually learn local curvature.',
    },
    duration: '4.5s',
  },
};

function OptimizerMotionGraphic({
  optimizer,
  lang,
}: {
  optimizer: OptimizerId;
  lang: Lang;
}) {
  const motion = optimizerMotion[optimizer];
  const color = OPTIMIZER_COLORS[optimizer];
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#f8fafc,#eff6ff)] p-4">
      <svg className="h-52 w-full" viewBox="0 0 370 220">
        <title>{local(motion.caption, lang)}</title>
        <g
          fill="none"
          stroke="#94a3b8"
          strokeOpacity="0.45"
          transform="rotate(-18 245 110)"
        >
          <ellipse cx="245" cy="110" rx="118" ry="76" />
          <ellipse cx="245" cy="110" rx="94" ry="58" />
          <ellipse cx="245" cy="110" rx="70" ry="41" />
          <ellipse cx="245" cy="110" rx="46" ry="25" />
          <ellipse cx="245" cy="110" rx="23" ry="12" />
        </g>
        <path
          d={motion.path}
          fill="none"
          stroke={color}
          strokeDasharray="5 5"
          strokeLinecap="round"
          strokeWidth="2.5"
          opacity="0.7"
        />
        <circle
          cx="326"
          cy="108"
          r="8"
          fill="white"
          stroke="#b45309"
          strokeWidth="2"
        />
        <circle r="7" fill={color} stroke="white" strokeWidth="2">
          <animateMotion
            dur={motion.duration}
            path={motion.path}
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      <figcaption className="border-t border-slate-200 pt-3 text-center text-sm leading-6 text-slate-600">
        {local(motion.caption, lang)}
      </figcaption>
    </figure>
  );
}

function ResultCard({
  result,
  lang,
}: {
  result: OptimizationResult;
  lang: Lang;
}) {
  const info = optimizerInfo[result.optimizer];
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className="size-2.5 rounded-full ring-1 ring-inset ring-slate-400/60"
            style={{ backgroundColor: OPTIMIZER_COLORS[result.optimizer] }}
          />
          {info.short}
        </span>
        <span
          className={`font-mono text-[11px] ${result.converged ? 'text-emerald-700' : result.status === 'diverged' ? 'text-rose-700' : 'text-amber-700'}`}
        >
          {local(statusText[result.status], lang)}
        </span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5">
        <Metric label="Iterations" value={String(result.iterations)} />
        <Metric label="Final loss" value={formatNumber(result.finalLoss)} />
        <Metric
          label="Function evals"
          value={String(result.functionEvaluations)}
        />
        <Metric
          label="Gradient evals"
          value={String(result.gradientEvaluations)}
        />
        <Metric
          label="Hessian evals"
          value={String(result.hessianEvaluations)}
        />
        <Metric
          label="Final position"
          value={`(${result.finalPosition.map((value) => formatNumber(value, 2)).join(', ')})`}
        />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1.5 break-words font-mono text-xs text-slate-800">
        {value}
      </p>
    </div>
  );
}
