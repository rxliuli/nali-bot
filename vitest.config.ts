import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          DISCORD_APPLICATION_ID: 'test-app-id',
          DISCORD_PUBLIC_KEY: 'a7c1db2ff9d4b1e5065e1088d296e6fc9425bc3f3f5ee49147324a69d7fba61c',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
})
