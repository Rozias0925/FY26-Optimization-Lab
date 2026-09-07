export type Point = [number, number];
export type ObjectiveId =
  | 'quadratic'
  | 'rosenbrock'
  | 'himmelblau'
  | 'double_well'
  | 'three_hump_camel';
export type OptimizerId = 'gd' | 'momentum' | 'adam' | 'newton' | 'bfgs';
export type RunStatus =
  | 'converged'
  | 'max_iterations'
  | 'diverged'
  | 'numerical_failure'
  | 'curvature_failure'
  | 'stationary_nonminimum';

export type OptimizationResult = {
  optimizer: OptimizerId;
  trajectory: Point[];
  losses: number[];
  gradientNorms: number[];
  iterations: number;
  functionEvaluations: number;
  gradientEvaluations: number;
  hessianEvaluations: number;
  finalPosition: Point;
  finalLoss: number;
  converged: boolean;
  status: RunStatus;
};

export type ExperimentConfig = {
  objective: ObjectiveId;
  start: Point;
  optimizers: OptimizerId[];
  learningRate: number;
  momentum: number;
  conditionNumber: number;
  rotation: number;
  maxIterations?: number;
};

export type Objective = {
  id: ObjectiveId;
  name: string;
  formula: string;
  concept: string;
  description: string;
  range: { x: [number, number]; y: [number, number] };
  minima: Point[];
  localMinima?: Point[];
  saddles?: Point[];
  globalMinimumValue: number;
  value(point: Point): number;
  gradient(point: Point): Point;
  hessian(point: Point): [number, number, number, number];
};

const norm = ([x, y]: Point) => Math.hypot(x, y);
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, s: number): Point => [a[0] * s, a[1] * s];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const matVec = (m: [number, number, number, number], p: Point): Point => [
  m[0] * p[0] + m[1] * p[1],
  m[2] * p[0] + m[3] * p[1],
];

export function createObjective(
  id: ObjectiveId,
  conditionNumber = 24,
  rotation = 28,
): Objective {
  if (id === 'quadratic') {
    const theta = (rotation * Math.PI) / 180;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const q11 = c * c + conditionNumber * s * s;
    const q12 = (1 - conditionNumber) * c * s;
    const q22 = s * s + conditionNumber * c * c;
    const q: [number, number, number, number] = [q11, q12, q12, q22];
    return {
      id,
      name: 'Quadratic bowl',
      formula: 'f(x) = ½xᵀQx',
      concept: 'Conditioning',
      description:
        'The condition number measures the gap between steep and shallow directions. A larger gap makes first-order methods zig-zag across the valley.',
      range: { x: [-5, 5], y: [-5, 5] },
      minima: [[0, 0]],
      globalMinimumValue: 0,
      value: (p) => 0.5 * dot(p, matVec(q, p)),
      gradient: (p) => matVec(q, p),
      hessian: () => q,
    };
  }

  if (id === 'rosenbrock') {
    const a = 1;
    const b = 100;
    return {
      id,
      name: 'Rosenbrock valley',
      formula: 'f(x,y) = (1−x)² + 100(y−x²)²',
      concept: 'Curved valley',
      description:
        'The minimum sits inside a narrow bending valley. An optimizer must move downhill while repeatedly correcting its direction.',
      range: { x: [-2.2, 2.2], y: [-1.2, 3.2] },
      minima: [[1, 1]],
      globalMinimumValue: 0,
      value: ([x, y]) => (a - x) ** 2 + b * (y - x * x) ** 2,
      gradient: ([x, y]) => [
        2 * (x - a) - 4 * b * x * (y - x * x),
        2 * b * (y - x * x),
      ],
      hessian: ([x, y]) => [
        2 - 4 * b * (y - 3 * x * x),
        -4 * b * x,
        -4 * b * x,
        2 * b,
      ],
    };
  }

  if (id === 'himmelblau') {
    return {
      id,
      name: 'Himmelblau landscape',
      formula: 'f(x,y) = (x²+y−11)² + (x+y²−7)²',
      concept: 'Multiple basins',
      description:
        'Four attraction basins share the same landscape. The starting point can change which global minimum the optimizer discovers.',
      range: { x: [-5.5, 5.5], y: [-5.5, 5.5] },
      minima: [
        [3, 2],
        [-2.805, 3.131],
        [-3.779, -3.283],
        [3.584, -1.848],
      ],
      globalMinimumValue: 0,
      value: ([x, y]) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
      gradient: ([x, y]) => {
        const a = x * x + y - 11;
        const b = x + y * y - 7;
        return [4 * x * a + 2 * b, 2 * a + 4 * y * b];
      },
      hessian: ([x, y]) => [
        12 * x * x + 4 * y - 42,
        4 * (x + y),
        4 * (x + y),
        4 * x + 12 * y * y - 26,
      ],
    };
  }

  if (id === 'double_well') {
    const minimumX = 1 / Math.sqrt(2);
    return {
      id,
      name: 'Double-well geometry',
      formula: 'f(x,y) = x⁴−x²+y²',
      concept: 'Saddle & negative curvature',
      description:
        'A saddle at the origin separates two equally good wells. Small gradients near the saddle do not imply that a minimum has been found.',
      range: { x: [-1.6, 1.6], y: [-1.4, 1.4] },
      minima: [
        [-minimumX, 0],
        [minimumX, 0],
      ],
      saddles: [[0, 0]],
      globalMinimumValue: -0.25,
      value: ([x, y]) => x ** 4 - x ** 2 + y ** 2,
      gradient: ([x, y]) => [4 * x ** 3 - 2 * x, 2 * y],
      hessian: ([x]) => [12 * x ** 2 - 2, 0, 0, 2],
    };
  }

  const localMinimumX = Math.sqrt((21 + Math.sqrt(91)) / 10);
  const saddleX = Math.sqrt((21 - Math.sqrt(91)) / 10);
  return {
    id,
    name: 'Three-hump camel',
    formula: 'f(x,y) = 2x²−1.05x⁴+x⁶/6+xy+y²',
    concept: 'Local vs. global minimum',
    description:
      'One global basin at the origin is flanked by two suboptimal local basins. A small gradient can therefore certify local convergence without global optimality.',
    range: { x: [-2.4, 2.4], y: [-1.8, 1.8] },
    minima: [[0, 0]],
    localMinima: [
      [localMinimumX, -localMinimumX / 2],
      [-localMinimumX, localMinimumX / 2],
    ],
    saddles: [
      [saddleX, -saddleX / 2],
      [-saddleX, saddleX / 2],
    ],
    globalMinimumValue: 0,
    value: ([x, y]) => 2 * x ** 2 - 1.05 * x ** 4 + x ** 6 / 6 + x * y + y ** 2,
    gradient: ([x, y]) => [4 * x - 4.2 * x ** 3 + x ** 5 + y, x + 2 * y],
    hessian: ([x]) => [4 - 12.6 * x ** 2 + 5 * x ** 4, 1, 1, 2],
  };
}

function inverse2x2(
  m: [number, number, number, number],
): [number, number, number, number] | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
}

function isPositiveDefinite(m: [number, number, number, number]) {
  return m[0] > 1e-10 && m[0] * m[3] - m[1] * m[2] > 1e-10;
}

function hasDiverged(point: Point, loss: number) {
  return (
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1]) ||
    !Number.isFinite(loss) ||
    Math.abs(point[0]) > 1e6 ||
    Math.abs(point[1]) > 1e6 ||
    Math.abs(loss) > 1e24
  );
}

function makeResult(
  optimizer: OptimizerId,
  trajectory: Point[],
  losses: number[],
  gradientNorms: number[],
  status: RunStatus,
  counts: { f: number; g: number; h: number },
): OptimizationResult {
  const finalPosition = trajectory.at(-1) ?? [0, 0];
  return {
    optimizer,
    trajectory,
    losses,
    gradientNorms,
    iterations: Math.max(0, trajectory.length - 1),
    functionEvaluations: counts.f,
    gradientEvaluations: counts.g,
    hessianEvaluations: counts.h,
    finalPosition,
    finalLoss: losses.at(-1) ?? Number.NaN,
    converged: status === 'converged',
    status,
  };
}

export function runOptimizer(
  optimizer: OptimizerId,
  objective: Objective,
  start: Point,
  learningRate: number,
  momentum = 0.9,
  maxIterations = 300,
  tolerance = 1e-5,
): OptimizationResult {
  let point: Point = [...start];
  let loss = objective.value(point);
  const trajectory: Point[] = [[...point]];
  const losses = [loss];
  const gradientNorms: number[] = [];
  const counts = { f: 1, g: 0, h: 0 };
  let status: RunStatus = 'max_iterations';
  let velocity: Point = [0, 0];
  let firstMoment: Point = [0, 0];
  let secondMoment: Point = [0, 0];
  let inverseHessian: [number, number, number, number] = [1, 0, 0, 1];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const gradient = objective.gradient(point);
    counts.g += 1;
    const gradientNorm = norm(gradient);
    gradientNorms.push(gradientNorm);

    if (!Number.isFinite(gradientNorm)) {
      status = 'numerical_failure';
      break;
    }
    if (gradientNorm < tolerance) {
      status = isPositiveDefinite(objective.hessian(point))
        ? 'converged'
        : 'stationary_nonminimum';
      break;
    }

    let next: Point;
    if (optimizer === 'gd') {
      next = sub(point, scale(gradient, learningRate));
    } else if (optimizer === 'momentum') {
      velocity = add(scale(velocity, momentum), gradient);
      next = sub(point, scale(velocity, learningRate));
    } else if (optimizer === 'adam') {
      const t = iteration + 1;
      const beta1 = 0.9;
      const beta2 = 0.999;
      firstMoment = add(scale(firstMoment, beta1), scale(gradient, 1 - beta1));
      secondMoment = [
        beta2 * secondMoment[0] + (1 - beta2) * gradient[0] ** 2,
        beta2 * secondMoment[1] + (1 - beta2) * gradient[1] ** 2,
      ];
      const correctedM = scale(firstMoment, 1 / (1 - beta1 ** t));
      const correctedV: Point = [
        secondMoment[0] / (1 - beta2 ** t),
        secondMoment[1] / (1 - beta2 ** t),
      ];
      next = [
        point[0] -
          (learningRate * correctedM[0]) / (Math.sqrt(correctedV[0]) + 1e-8),
        point[1] -
          (learningRate * correctedM[1]) / (Math.sqrt(correctedV[1]) + 1e-8),
      ];
    } else if (optimizer === 'newton') {
      const hessian = objective.hessian(point);
      counts.h += 1;
      if (!isPositiveDefinite(hessian)) {
        status = 'curvature_failure';
        break;
      }
      const inverse = inverse2x2(hessian);
      if (!inverse) {
        status = 'numerical_failure';
        break;
      }
      let direction = scale(matVec(inverse, gradient), -1);
      const directionNorm = norm(direction);
      if (directionNorm > 3) direction = scale(direction, 3 / directionNorm);
      let alpha = 1;
      let candidate = add(point, direction);
      let candidateLoss = objective.value(candidate);
      counts.f += 1;
      while (candidateLoss > loss && alpha > 1 / 128) {
        alpha *= 0.5;
        candidate = add(point, scale(direction, alpha));
        candidateLoss = objective.value(candidate);
        counts.f += 1;
      }
      next = candidate;
    } else {
      let direction = scale(matVec(inverseHessian, gradient), -1);
      if (dot(direction, gradient) >= 0) {
        inverseHessian = [1, 0, 0, 1];
        direction = scale(gradient, -1);
      }
      const directionNorm = norm(direction);
      if (directionNorm > 4) direction = scale(direction, 4 / directionNorm);
      let alpha = 1;
      let candidate = add(point, scale(direction, alpha));
      let candidateLoss = objective.value(candidate);
      counts.f += 1;
      const slope = dot(gradient, direction);
      while (candidateLoss > loss + 1e-4 * alpha * slope && alpha > 1 / 512) {
        alpha *= 0.5;
        candidate = add(point, scale(direction, alpha));
        candidateLoss = objective.value(candidate);
        counts.f += 1;
      }
      next = candidate;
      const nextGradient = objective.gradient(next);
      counts.g += 1;
      const sVector = sub(next, point);
      const yVector = sub(nextGradient, gradient);
      const ys = dot(yVector, sVector);
      if (ys > 1e-10) {
        const rho = 1 / ys;
        const iMinusSY: [number, number, number, number] = [
          1 - rho * sVector[0] * yVector[0],
          -rho * sVector[0] * yVector[1],
          -rho * sVector[1] * yVector[0],
          1 - rho * sVector[1] * yVector[1],
        ];
        const iMinusYS: [number, number, number, number] = [
          1 - rho * yVector[0] * sVector[0],
          -rho * yVector[0] * sVector[1],
          -rho * yVector[1] * sVector[0],
          1 - rho * yVector[1] * sVector[1],
        ];
        const left: [number, number, number, number] = [
          iMinusSY[0] * inverseHessian[0] + iMinusSY[1] * inverseHessian[2],
          iMinusSY[0] * inverseHessian[1] + iMinusSY[1] * inverseHessian[3],
          iMinusSY[2] * inverseHessian[0] + iMinusSY[3] * inverseHessian[2],
          iMinusSY[2] * inverseHessian[1] + iMinusSY[3] * inverseHessian[3],
        ];
        inverseHessian = [
          left[0] * iMinusYS[0] + left[1] * iMinusYS[2] + rho * sVector[0] ** 2,
          left[0] * iMinusYS[1] +
            left[1] * iMinusYS[3] +
            rho * sVector[0] * sVector[1],
          left[2] * iMinusYS[0] +
            left[3] * iMinusYS[2] +
            rho * sVector[1] * sVector[0],
          left[2] * iMinusYS[1] + left[3] * iMinusYS[3] + rho * sVector[1] ** 2,
        ];
      }
    }

    const nextLoss = objective.value(next);
    counts.f += 1;
    if (hasDiverged(next, nextLoss)) {
      status = 'diverged';
      break;
    }
    point = next;
    loss = nextLoss;
    trajectory.push([...point]);
    losses.push(loss);
  }

  if (status === 'max_iterations') {
    const finalGradient = objective.gradient(point);
    counts.g += 1;
    gradientNorms.push(norm(finalGradient));
    if (norm(finalGradient) < tolerance) {
      status = isPositiveDefinite(objective.hessian(point))
        ? 'converged'
        : 'stationary_nonminimum';
    }
  }

  return makeResult(
    optimizer,
    trajectory,
    losses,
    gradientNorms,
    status,
    counts,
  );
}

export function runComparison(config: ExperimentConfig): OptimizationResult[] {
  const objective = createObjective(
    config.objective,
    config.conditionNumber,
    config.rotation,
  );
  return config.optimizers.map((optimizer) =>
    runOptimizer(
      optimizer,
      objective,
      config.start,
      config.learningRate,
      config.momentum,
      config.maxIterations ?? 300,
    ),
  );
}
