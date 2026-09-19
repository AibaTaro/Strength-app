import { useEffect, useMemo, useRef, useState } from "react";
import { BODY_GROUPS } from "../domain/bodyMap";
import { Segmented } from "./ui";

type View = "front" | "back";
const W = 420;
const H = 780;

/**
 * 人体図(解剖学モデル)をタップして、鍛える部位を選ぶ。
 * 色付きのレイヤー(public/bodymap)を重ね、選んだ部位は明るく、未選択は薄く光って押せる場所を示す。
 */
export function BodyMap({
  value,
  onChange,
  onAuto,
  note,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  onAuto: () => void;
  note?: string | null;
}) {
  const [view, setView] = useState<View>("front");
  const alpha = useRef(new Map<string, ImageData>());
  const [ready, setReady] = useState(0);
  const groups = useMemo(() => BODY_GROUPS.filter((g) => g.views.includes(view)), [view]);

  // 部位ごとのレイヤーを読み込み、タップ判定用の透明度マップを作る
  useEffect(() => {
    let alive = true;
    for (const g of groups) {
      const key = `${view}-${g.id}`;
      if (alpha.current.has(key)) continue;
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        alpha.current.set(key, ctx.getImageData(0, 0, c.width, c.height));
        setReady((n) => n + 1);
      };
      img.src = `/bodymap/${key}.png`;
    }
    return () => {
      alive = false;
    };
  }, [groups, view]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  function onTap(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    // 面積の小さい部位(肩・腕)を優先して判定する
    const hits = groups
      .map((g) => ({ g, d: alpha.current.get(`${view}-${g.id}`) }))
      .filter((h): h is { g: (typeof groups)[number]; d: ImageData } => !!h.d && h.d.data[(y * h.d.width + x) * 4 + 3] > 0)
      .sort((a, b) => area(a.d) - area(b.d));
    if (hits.length) toggle(hits[0].g.id);
  }

  return (
    <div className="bodymap" data-ready={ready}>
      <Segmented<View>
        label="人体の向き"
        value={view}
        onChange={setView}
        options={[
          { value: "front", label: "前から" },
          { value: "back", label: "後ろから" },
        ]}
      />
      <div className="bodymap-stage" onPointerUp={onTap} data-testid="bodymap-stage">
        <img className="bodymap-base" src={`/bodymap/${view}.png`} alt="筋肉を表した人体模型" width={W} height={H} draggable={false} />
        {groups.map((g) => (
          <img
            key={g.id}
            className={value.includes(g.id) ? "bodymap-layer bodymap-on" : "bodymap-layer"}
            src={`/bodymap/${view}-${g.id}.png`}
            alt=""
            width={W}
            height={H}
            draggable={false}
          />
        ))}
      </div>
      <p className="muted bodymap-hint">
        {value.length === 0
          ? "鍛えたい部位をタップしてください。未選択なら全身からおまかせで選びます。"
          : `選択中：${BODY_GROUPS.filter((g) => value.includes(g.id)).map((g) => g.label).join("・")}`}
      </p>
      {note && value.length > 0 && (
        <p className="muted bodymap-note" data-testid="auto-note">
          {note}
        </p>
      )}
      <button type="button" className="btn btn-secondary btn-sm" onClick={onAuto}>
        おまかせで選ぶ
      </button>
      {value.length > 0 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>
          選択をすべて解除
        </button>
      )}
      {/* 画面読み上げ・キーボード操作用(全部位) */}
      <div role="group" aria-label="鍛える部位" className="sr-only">
        {BODY_GROUPS.map((g) => (
          <button key={g.id} type="button" aria-pressed={value.includes(g.id)} onClick={() => toggle(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const areaCache = new WeakMap<ImageData, number>();
function area(d: ImageData) {
  let a = areaCache.get(d);
  if (a === undefined) {
    a = 0;
    for (let i = 3; i < d.data.length; i += 4) if (d.data[i] > 0) a++;
    areaCache.set(d, a);
  }
  return a;
}
