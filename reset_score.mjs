import { kv } from '@vercel/kv';

const TARGET_USERNAME = 'hydrenalyn';

async function resetScore() {
  // 1. Fetch all leaderboard entries to find the userId for the target username
  const raw = await kv.zrange('ubc_leaderboard', 0, -1, { rev: true, withScores: true });

  let targetUserId = null;

  for (let i = 0; i < raw.length; i += 2) {
    const userId = raw[i];
    const username = await kv.hget(`user:${userId}`, 'username');
    if (username === TARGET_USERNAME) {
      targetUserId = userId;
      const score = raw[i + 1];
      console.log(`Found "${TARGET_USERNAME}" → userId: ${userId}, current score: ${score}`);
      break;
    }
  }

  if (!targetUserId) {
    console.log(`User "${TARGET_USERNAME}" not found on the leaderboard.`);
    return;
  }

  // 2. Remove them from the sorted set entirely
  await kv.zrem('ubc_leaderboard', targetUserId);

  // 3. Reset their bestScore in their user hash to 0
  await kv.hset(`user:${targetUserId}`, { bestScore: 0 });

  console.log(`✅ Done. "${TARGET_USERNAME}" has been removed from the leaderboard and their best score reset to 0.`);
  console.log(`   They will re-appear on the leaderboard after their next legitimate game.`);
}

resetScore().catch(console.error);
