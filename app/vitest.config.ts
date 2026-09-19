import { defineConfig } from 'vitest/config'

// e2e/ はPlaywrightが実行する。vitestはユニットテストのみ対象にする。
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
