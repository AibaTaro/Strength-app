import { stepWeight, minWeight, maxWeight } from "../domain/equipment";
import { Icon } from "./ui";

interface Props {
  steps: readonly number[];
  valueKg: number;
  onChange: (next: number) => void;
}

/** ダンベルの重量選択。+/-は必ず登録済みの隣の重量へ移動する(中間値を作らない)。 */
export function WeightStepPicker({ steps, valueKg, onChange }: Props) {
  const atMin = valueKg <= minWeight(steps);
  const atMax = valueKg >= maxWeight(steps);
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        aria-label="重量を1段階軽くする"
        disabled={atMin}
        onClick={() => onChange(stepWeight(steps, valueKg, -1))}
      >
        <Icon name="minus" />
      </button>
      <div className="stepper-value" aria-live="polite">
        <output data-testid="weight-value" aria-label="重量">
          {valueKg}
        </output>
        <span className="stepper-unit">kg</span>
        <span className="stepper-sub">{atMax ? "最大重量" : atMin ? "最小重量" : "1個あたり"}</span>
      </div>
      <button
        type="button"
        className="stepper-btn"
        aria-label="重量を1段階重くする"
        disabled={atMax}
        onClick={() => onChange(stepWeight(steps, valueKg, 1))}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}
