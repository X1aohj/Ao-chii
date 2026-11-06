const fs = require("fs");
const path = require("path");
const { writeThemeAssets, BAR_DAYS, RADAR_DAYS } = require("./profile-themes");

const owner = process.env.PROFILE_OWNER;
const token = process.env.GITHUB_TOKEN;
const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const outDir = process.env.PROFILE_STATS_OUT_DIR || path.join(workspace, "dist");

if (!owner) {
  throw new Error("PROFILE_OWNER is required");
}

// 贡献数据只能走 GraphQL，必须带 token；Actions 里的 github.token 就够用
if (!token) {
  throw new Error("GITHUB_TOKEN is required");
}

fs.mkdirSync(outDir, { recursive: true });

const baseHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "x1aohj-profile-readme",
};

const pct = (value, total) => (total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%");

async function requestJson(url) {
  const attempts = token ? [true, false] : [false];
  let lastError = "";

  for (const useToken of attempts) {
    const headers = { ...baseHeaders };
    if (useToken) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    if (response.ok) {
      return response.json();
    }

    const body = await response.text();
    lastError = `${response.status} ${response.statusText}: ${url}\n${body}`;
    if (useToken && (response.status === 401 || response.status === 403)) {
      console.warn(`Retrying without GITHUB_TOKEN: ${url}`);
      continue;
    }

    throw new Error(lastError);
  }

  throw new Error(lastError);
}

async function requestGraphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...baseHeaders, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(`GraphQL ${response.status}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

async function listOwnerRepos() {
  const repos = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?type=owner&sort=updated&per_page=100&page=${page}`;
    const data = await requestJson(url);
    repos.push(...data);
    if (data.length < 100) break;
  }

  return repos.filter((repo) =>
    repo.owner.login.toLowerCase() === owner.toLowerCase() &&
    !repo.fork &&
    !repo.archived
  );
}

/*
 * 一次查询取齐：按类型的贡献数给雷达，按天的贡献日历给活动柱。
 * 公开事件接口已经不带 PushEvent 的提交数，而贡献日历会算上每个提交，打开私有贡献展示后还含私有仓库。
 */
async function fetchContributions() {
  const to = new Date();
  const from = new Date(to.getTime() - RADAR_DAYS * 86400000);
  const data = await requestGraphql(`query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        totalRepositoryContributions
        contributionCalendar { weeks { contributionDays { contributionCount } } }
      }
    }
  }`, { login: owner, from: from.toISOString(), to: to.toISOString() });

  const collection = data.user.contributionsCollection;
  const days = collection.contributionCalendar.weeks.flatMap((week) => week.contributionDays.map((day) => day.contributionCount));
  return {
    buckets: days.slice(-BAR_DAYS),
    activity: {
      commits: collection.totalCommitContributions,
      pullRequests: collection.totalPullRequestContributions,
      reviews: collection.totalPullRequestReviewContributions,
      issues: collection.totalIssueContributions,
      repositories: collection.totalRepositoryContributions,
    },
  };
}

async function main() {
  const repos = await listOwnerRepos();
  const languages = new Map();
  const failedRepos = [];

  for (const repo of repos) {
    try {
      const data = await requestJson(repo.languages_url);
      for (const [name, bytes] of Object.entries(data)) {
        languages.set(name, (languages.get(name) || 0) + bytes);
      }
    } catch (error) {
      console.warn(`Skipped ${repo.name}: ${error.message}`);
      failedRepos.push(repo.name);
    }
  }

  if (failedRepos.length > 0) {
    throw new Error(`Language generation aborted. Failed repos: ${failedRepos.join(", ")}`);
  }

  const totalLangBytes = [...languages.values()].reduce((sum, bytes) => sum + bytes, 0);
  const sortedLangs = [...languages.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const { buckets, activity } = await fetchContributions();
  console.log(`Counted ${buckets.reduce((sum, value) => sum + value, 0)} contributions in ${BAR_DAYS} days; ${RADAR_DAYS}-day activity ${JSON.stringify(activity)}`);

  const themed = writeThemeAssets(outDir, { repos, langs: sortedLangs, totalLangBytes, buckets, activity });
  console.log(`Generated ${themed.length} themed assets for ${repos.length} public non-fork repositories.`);
  console.log(sortedLangs.slice(0, 6).map((lang) => `${lang.name} ${pct(lang.bytes, totalLangBytes)}`).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
