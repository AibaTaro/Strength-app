import { useState } from "react";
import type { Exercise } from "../domain/types";
import { motionSrcFor } from "../domain/motion";
import { Icon } from "./ui";

/**
 * 「やり方を見る」: 3Dモデルの動作GIFと、負荷がかかる部位の凡例を表示する。
 * 初心者向けの参考表示で、知っている人の邪魔にならないよう開閉できる。
 */
export function MotionGuide({ exercise, defaultOpen = false }: { exercise: Exercise; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [failed, setFailed] = useState(false);
  return (
    <div className="motion">
      <button
        type="button"
        className="btn btn-secondary btn-sm motion-toggle"
        aria-expanded={open}
        aria-label={`${exercise.name}のやり方を${open ? "隠す" : "見る"}`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="play" size={16} /> {open ? "やり方を隠す" : "やり方を見る"}
      </button>
      {open && (
        <div className="motion-panel">
          {failed ? (
            <p className="muted">アニメーションを読み込めませんでした（記録には影響しません）。</p>
          ) : (
            <img
              className="motion-img"
              src={motionSrcFor(exercise.id)}
              alt={`${exercise.name}の動作(3Dモデル)`}
              width={360}
              height={480}
              onError={() => setFailed(true)}
            />
          )}
          <div className="motion-legend">
            <span className="legend-item">
              <span className="legend-dot legend-main" aria-hidden="true" />
              主に効く：{exercise.primaryMuscle}
            </span>
            {exercise.secondaryMuscles.length > 0 && (
              <span className="legend-item">
                <span className="legend-dot legend-sub" aria-hidden="true" />
                補助：{exercise.secondaryMuscles.join("・")}
              </span>
            )}
          </div>
          <ol className="motion-tips" aria-label="フォームの要点">
            {exercise.formTips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <p className="muted">参考アニメーションです。フォームの正確性は専門家未確認のため、無理のない範囲で行ってください。</p>
        </div>
      )}
    </div>
  );
}
