import type { Bindings } from '../src/env'

declare global {
  namespace Cloudflare {
    // Merge the app's bindings into the Workers runtime Env used by `cloudflare:test`.
    interface Env extends Bindings {}
  }
}

export {}
