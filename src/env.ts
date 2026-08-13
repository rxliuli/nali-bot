import type { GameRoom } from './do/GameRoom'

/** Bindings available to the Worker and Durable Objects. */
export interface Bindings {
  DISCORD_TOKEN: string
  DISCORD_PUBLIC_KEY: string
  DISCORD_APPLICATION_ID: string
  GameRoom: DurableObjectNamespace<GameRoom>
}

/** Typed variables set from interaction options / modal inputs. */
export interface Variables {
  deck?: string
  answer?: string
  [key: string]: unknown
}

export type Env = {
  Bindings: Bindings
  Variables: Variables
}
