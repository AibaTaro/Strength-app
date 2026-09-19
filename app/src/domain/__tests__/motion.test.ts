import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { INITIAL_EXERCISES } from "../exercises";

// 「やり方アニメーション」が全種目にあり、本物のアニメーションGIFであることを確認する。
describe("やり方アニメーション(public/motions)", () => {
  for (const ex of INITIAL_EXERCISES) {
    it(`${ex.name}: GIFが存在し、複数フレームで、1.2MB未満`, () => {
      const file = `public/motions/${ex.id}.gif`;
      expect(existsSync(file), `${file} がありません。npm run motions で生成してください`).toBe(true);
      const buf = readFileSync(file);
      expect(buf.subarray(0, 6).toString("ascii")).toBe("GIF89a");
      // 画像記述子(0x2C)ではなく、グラフィック制御拡張(21 F9)の数でフレーム数を数える
      let frames = 0;
      for (let i = 0; i < buf.length - 1; i++) if (buf[i] === 0x21 && buf[i + 1] === 0xf9) frames++;
      expect(frames).toBeGreaterThan(10);
      expect(statSync(file).size).toBeLessThan(1200 * 1024);
    });
  }
});
