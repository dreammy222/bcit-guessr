import { kv } from '@vercel/kv';

async function checkBoard() {
  const result = await kv.zrange('ubc_leaderboard', 0, 49, { rev: true, withScores: true });
  console.log('Top 50 leaderboard entries (raw):');
  console.log(JSON.stringify(result, null, 2));
}

checkBoard().catch(console.error);
