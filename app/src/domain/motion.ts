/** 種目のやり方アニメーション(GIF)。`npm run motions` で public/motions/ に生成する。 */
export function motionSrcFor(exerciseId: string): string {
  return `/motions/${exerciseId}.gif`;
}
