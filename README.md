# Optimization Visual Lab

## At a glance for reviewers

**Project type:** interactive optimization software for five analytic 2D landscapes and five optimizers. **What it demonstrates:** objective/derivative implementation, controlled algorithm comparisons, and interpretation of stopping behavior versus global optimality. **Suggested first visit:** [open the lab](https://rozias0925.github.io/FY26-Optimization-Lab/), select Rosenbrock, and compare Gradient Descent, Newton, and BFGS under the same starting point. **Inspect the implementation:** [optimization core](lib/optimization.ts) and [UI](components/optimization-lab.tsx). This is an educational comparison, not an empirical claim of general optimizer superiority.


A bilingual, browser-based laboratory for understanding how the shape of an objective function changes an optimization algorithm's path and stopping behavior. It compares five optimizers on five two-dimensional landscapes, connecting mathematical update rules with trajectories, loss curves, and numerical diagnostics. The numerical implementation and website source are included in this repository.

[Open the interactive lab](https://rozias0925.github.io/FY26-Optimization-Lab/) · [Mathematical implementation](lib/optimization.ts) · [Researcher profile](https://rozias0925.github.io/Rozias-Website/index_en.html)

## What the lab investigates

| Landscape | Main question |
| --- | --- |
| Quadratic bowl | How does conditioning affect progress and oscillation? |
| Rosenbrock valley | How do methods navigate a curved, narrow valley? |
| Himmelblau landscape | How does initialization determine the basin reached? |
| Double-well | Why can a small gradient indicate a saddle rather than a minimum? |
| Three-hump camel | Why does convergence to a local minimum not imply global optimality? |

The methods are **Gradient Descent, Momentum, Adam, Newton, and BFGS**. Objective values, gradients, and Hessians are evaluated by the numerical core rather than inferred from the animation.

## Experimental workflow

1. Choose a landscape, starting point, optimizers, and parameters, or load a preset.
2. Run the comparison and inspect the trajectories and loss curves.
3. Pause, replay, adjust playback speed, or move to a specific iteration.
4. Compare final loss, position, gradient norm, stopping status, evaluation counts, and the gap to the known global minimum.

Displayed results remain bound to the settings used for that run. Editing the setup does not reinterpret an earlier experiment.

The explanations distinguish iteration count from computational cost, handle tied iteration counts, and separate local convergence from global solution quality. A flat loss curve is not treated as sufficient evidence of convergence.

## Implementation and scope

- [lib/optimization.ts](lib/optimization.ts): objective functions, analytic derivatives, optimizers, and stopping logic.
- [components/optimization-lab.tsx](components/optimization-lab.tsx): experiment state, controls, result ledger, and explanations.
- [components/optimization-plot.tsx](components/optimization-plot.tsx): surfaces, trajectories, loss curves, and plot interaction.
- [components/math.tsx](components/math.tsx): KaTeX formula rendering.

Built with **TypeScript, React, Vinext/Vite, and KaTeX**. Experiments run locally in the browser; they do not require a backend, database, or external dataset.

## Run locally

Use Node.js **22.13 or later** and pnpm **10**:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000/`. To check TypeScript types, run `pnpm exec tsc --noEmit`.

The [GitHub Pages workflow](.github/workflows/deploy-pages.yml) builds the static export and prepares its repository-specific asset paths. For a guide to the project files, see [從這裡開始.md](從這裡開始.md).

## Limitations

This is an educational study of small, analytically specified problems, not a benchmark establishing general optimizer superiority. Results depend on initialization, hyperparameters, stopping rules, and implementation safeguards. In particular, the Newton and BFGS implementations use guarded steps; the animations should not be interpreted as unmodified textbook iterations.
