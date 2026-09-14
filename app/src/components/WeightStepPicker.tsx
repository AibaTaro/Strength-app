import { stepWeight, minWeight, maxWeight } from "../domain/equipment";

interface Props {
  steps: readonly number[];
  valueKg: number;
  onChange: (next: number) => void;
}

/** ダンベルの重量選択。+/-は必ず16段階の隣の登録重量へ移動する(中間値を作らない)。 */
export function WeightStepPicker({ steps, valueKg, onChange }: Props) {
  const atMin = valueKg <= minWeight(steps);
  const atMax = valueKg >= maxWeight(steps);
  return (
    <div className="weight-picker">
      <button
        type="button"
        aria-label="1段階軽くする"
        disabled={atMin}
        onClick={() => onChange(stepWeight(steps, valueKg, -1))}
      >
        −
      </button>
      <span className="weight-picker-value">{valueKg}kg</span>
      <button
        type="button"
        aria-label="1段階重くする"
        disabled={atMax}
        onClick={() => onChange(stepWeight(steps, valueKg, 1))}
      >
        ＋
      </button>
    </div>
  );
}
