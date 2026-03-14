import { query } from "../db.js";

// ─── Tier thresholds ────────────────────────────────────────
export type Tier = "bronze" | "silver" | "gold" | "diamond" | "mythic";

const TIER_THRESHOLDS: [number, Tier][] = [
  [5000, "mythic"],
  [2000, "diamond"],
  [500, "gold"],
  [100, "silver"],
  [0, "bronze"],
];

export function computeTier(xp: number): Tier {
  for (const [threshold, tier] of TIER_THRESHOLDS) {
    if (xp >= threshold) return tier;
  }
  return "bronze";
}

// ─── XP formula ─────────────────────────────────────────────
export interface RawStats {
  contributions: number;
  public_repos: number;
  pull_requests: number;
  followers: number;
  account_age_days: number;
  longest_streak: number;
}

export function computeXP(stats: RawStats): number {
  return (
    stats.contributions * 1 +
    stats.public_repos * 5 +
    stats.pull_requests * 2 +
    stats.followers * 1 +
    Math.floor(stats.account_age_days / 30) * 10 +
    stats.longest_streak * 3
  );
}

// ─── Achievement checking ───────────────────────────────────
interface AchievementRule {
  id: string;
  check: (s: RawStats) => boolean;
}

const ACHIEVEMENT_RULES: AchievementRule[] = [
  { id: "first-commit", check: (s) => s.contributions >= 1 },
  { id: "repo-10", check: (s) => s.public_repos >= 10 },
  { id: "repo-50", check: (s) => s.public_repos >= 50 },
  { id: "pr-50", check: (s) => s.pull_requests >= 50 },
  { id: "pr-200", check: (s) => s.pull_requests >= 200 },
  { id: "streak-7", check: (s) => s.longest_streak >= 7 },
  { id: "streak-30", check: (s) => s.longest_streak >= 30 },
  { id: "streak-100", check: (s) => s.longest_streak >= 100 },
  { id: "followers-50", check: (s) => s.followers >= 50 },
  { id: "followers-100", check: (s) => s.followers >= 100 },
  { id: "followers-500", check: (s) => s.followers >= 500 },
  { id: "year-1", check: (s) => s.account_age_days >= 365 },
  { id: "year-5", check: (s) => s.account_age_days >= 365 * 5 },
  { id: "year-10", check: (s) => s.account_age_days >= 365 * 10 },
];

export function checkAchievements(stats: RawStats): string[] {
  return ACHIEVEMENT_RULES.filter((r) => r.check(stats)).map((r) => r.id);
}

// ─── GitHub API fetching ────────────────────────────────────
function calculateLongestStreak(weeks: { contributionDays: { contributionCount: number }[] }[]): number {
  let longest = 0;
  let current = 0;
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      if (day.contributionCount > 0) {
        current++;
        if (current > longest) longest = current;
      } else {
        current = 0;
      }
    }
  }
  return longest;
}

export async function fetchGitHubStats(token: string, username: string): Promise<RawStats> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": "SquadeCode/1.0",
  };

  // Parallel: REST user profile + PR search + GraphQL contributions
  const [userRes, prRes, gqlRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch(`https://api.github.com/search/issues?q=author:${encodeURIComponent(username)}+type:pr&per_page=1`, { headers }),
    fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query {
          user(login: "${username}") {
            contributionsCollection {
              totalCommitContributions
              contributionCalendar {
                weeks {
                  contributionDays {
                    contributionCount
                  }
                }
              }
            }
          }
        }`,
      }),
    }),
  ]);

  const user = (await userRes.json()) as { public_repos: number; followers: number; created_at: string };
  const prData = (await prRes.json()) as { total_count: number };
  const gqlData = (await gqlRes.json()) as {
    data?: {
      user?: {
        contributionsCollection: {
          totalCommitContributions: number;
          contributionCalendar: {
            weeks: { contributionDays: { contributionCount: number }[] }[];
          };
        };
      };
    };
  };

  const accountCreated = new Date(user.created_at);
  const ageDays = Math.floor((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));

  const contributions = gqlData.data?.user?.contributionsCollection.totalCommitContributions ?? 0;
  const weeks = gqlData.data?.user?.contributionsCollection.contributionCalendar.weeks ?? [];
  const longestStreak = calculateLongestStreak(weeks);

  return {
    contributions,
    public_repos: user.public_repos ?? 0,
    pull_requests: prData.total_count ?? 0,
    followers: user.followers ?? 0,
    account_age_days: ageDays,
    longest_streak: longestStreak,
  };
}

// ─── Full refresh pipeline ──────────────────────────────────
export async function refreshUserStats(userId: string): Promise<{ xp: number; tier: Tier; achievements: string[] } | null> {
  // Get user's GitHub token and username
  const userResult = await query(
    "SELECT github_username, github_token FROM users WHERE id = $1",
    [userId],
  );
  if (userResult.rows.length === 0) return null;

  const { github_username, github_token } = userResult.rows[0];
  if (!github_token) return null;

  // Fetch stats from GitHub
  const stats = await fetchGitHubStats(github_token, github_username);
  const xp = computeXP(stats);
  const tier = computeTier(xp);
  const earned = checkAchievements(stats);

  // Upsert stats
  await query(
    `INSERT INTO user_github_stats (user_id, contributions, public_repos, pull_requests, followers, account_age_days, longest_streak, xp, tier, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (user_id)
     DO UPDATE SET contributions = $2, public_repos = $3, pull_requests = $4, followers = $5, account_age_days = $6, longest_streak = $7, xp = $8, tier = $9, fetched_at = now()`,
    [userId, stats.contributions, stats.public_repos, stats.pull_requests, stats.followers, stats.account_age_days, stats.longest_streak, xp, tier],
  );

  // Upsert achievements
  for (const achievementId of earned) {
    await query(
      `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, achievementId],
    );
  }

  return { xp, tier, achievements: earned };
}
