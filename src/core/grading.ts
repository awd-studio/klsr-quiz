/**
 * Шкала заліку з білетів (30 питань, 1 бал за відповідь):
 * «відмінно» 30–28, «добре» 27–24, «задовільно» 23–21, «незадовільно» 20 і менше.
 * Для іншої кількості питань пороги масштабуються пропорційно.
 */
export type GradeKey = 'excellent' | 'good' | 'satisfactory' | 'fail';

export interface Grade {
  readonly key: GradeKey;
  readonly label: string;
  /** Мінімальна кількість правильних відповідей для оцінки. */
  readonly min: number;
}

const SCALE = 30;
const THRESHOLDS: ReadonlyArray<readonly [GradeKey, string, number]> = [
  ['excellent', 'відмінно', 28],
  ['good', 'добре', 24],
  ['satisfactory', 'задовільно', 21],
];

/** Мінімальні бали для кожної оцінки при заданій кількості питань. */
export function gradeThresholds(total: number): Grade[] {
  const scaled = THRESHOLDS.map(([key, label, points]) => ({
    key,
    label,
    min: Math.ceil((total * points) / SCALE - 1e-9),
  }));
  return [...scaled, { key: 'fail', label: 'незадовільно', min: 0 }];
}

export function gradeFor(correct: number, total: number): Grade {
  if (total <= 0) return { key: 'fail', label: 'незадовільно', min: 0 };
  return gradeThresholds(total).find((g) => correct >= g.min)!;
}
