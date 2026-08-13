# Nali（Nǎlǐ 哪里）— Privacy Policy

*Last updated: 2026-08-13*

## 1. Overview

Nali（Nǎlǐ 哪里, "Nali") is a city-guessing game bot for Discord. This Privacy Policy explains what data the Bot processes, why, where it is stored, and your rights regarding that data.

## 2. Data We Process

The Bot processes the following data, **only** to run the game:

| Data | Why | Where |
|---|---|---|
| Discord user ID | Identify players and attribute guesses/scores | Durable Object storage |
| Discord username / display name | Show who answered correctly and on leaderboards | Durable Object storage |
| Channel ID (guild or DM) | Scope one game per channel | Durable Object storage |
| Guess answers (your submitted text) | Judge whether an answer is correct | Durable Object storage (round state, deleted after the round) |
| Interaction tokens | Send responses and the timed reveal via Discord's webhook API | Durable Object storage (ephemeral, expires ~15 minutes) |

The Bot does **not** collect messages outside of guess submissions, does not read channel history, does not collect IP addresses, and does not use cookies or tracking technologies.

## 3. How We Use the Data

Data is used exclusively to:

- Operate the guessing game (rounds, judging, reveals).
- Maintain per-channel leaderboards (`/rank`).
- Keep the Service working reliably (logs may contain error messages but not user content).

We do **not** sell, rent, or share your data with third parties for advertising or any other purpose.

## 4. Where Data Is Stored

- The Bot runs on **Cloudflare Workers**, a global edge platform. Game state is stored in **Cloudflare Durable Objects** (SQLite-backed), which may be replicated across Cloudflare's data centers as part of normal operation.
- Deck images are static files served from a public GitHub repository via jsDelivr; they do not contain user data.
- Interaction tokens are used only for Discord's webhook API and expire automatically (≈15 minutes).

## 5. Retention & Deletion

- **Round state** (including your submitted guesses) is deleted as soon as the round is revealed.
- **Scores** (user ID, username, score, first-answer count) persist per channel so `/rank` works across rounds. There is no cross-channel or global profile.
- To have your data removed from a channel's leaderboard, or for any other deletion request, contact us (section 8). We will delete the relevant records within a reasonable time.

## 6. Children's Privacy

The Bot is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided data through the Bot, contact us and we will remove it.

## 7. Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be reflected by updating the "Last updated" date above.

## 8. Contact

For privacy questions or deletion requests, contact: **[rxliuli@gmail.com](mailto:rxliuli@gmail.com)** *(replace with the operator's contact email)*
