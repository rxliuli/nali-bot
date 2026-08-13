import type { APIInteraction } from 'discord-api-types/v10'

/** Channel id present on command (2), component (3) and modal (5) interactions. */
export function getChannelId(interaction: APIInteraction): string {
  return (interaction as APIInteraction & { channel_id?: string }).channel_id ?? ''
}

/** User id for both guild (member.user) and DM (user) interactions. */
export function getUserId(interaction: APIInteraction): string {
  const i = interaction as APIInteraction & {
    member?: { user?: { id?: string } }
    user?: { id?: string }
  }
  return i.member?.user?.id ?? i.user?.id ?? ''
}

/** Display name for guild and DM interactions. */
export function getUsername(interaction: APIInteraction): string {
  const i = interaction as APIInteraction & {
    member?: { user?: { id?: string; global_name?: string | null; username?: string } }
    user?: { id?: string; global_name?: string | null; username?: string }
  }
  const user = i.member?.user ?? i.user
  return user?.global_name || user?.username || 'unknown'
}
