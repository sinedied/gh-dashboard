#!/usr/bin/env node
/*
 * This script fetches data about the repositories listed in `data/repos.md`
 * and saves it to `data/repos.json`.
 * Usage: `tsx .github/scripts/update-repos.ts [<partial-repo-name>]`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Octokit } from 'octokit';
import dotenv from 'dotenv';
import semver from 'semver';

dotenv.config({ override: true });

export interface RepoInfo {
  name: string;
  description: string;
  topics: string[];
  languages: string[];
  stars: number;
  forks: number;
  openIssues: number;
  openPullRequests: number;
  securityAlerts: {
    advisories: number;
    dependabot?: number;
    codeScanning?: number;
    secretScanning?: number;
  };
  lastCommitDate: string;
  packageVersions: Record<string, string>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPOS_LIST = path.join(__dirname, '..', '..', 'data', 'repos.md');
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'data', 'repos.json');
const PACKAGES = {
  '@angular/core': 'Angular',
  'react': 'React',
  'vue': 'Vue',
  'svelte': 'Svelte',
  'lit': 'Lit',
  'typescript': 'TypeScript',
  '@azure/functions': 'Functions',
  'langchain': 'LangChain.js',
  'fastify': 'Fastify',
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const parseRepoUrl = (repoUrl: string) => repoUrl.replace('https://github.com/', '').split('/');

async function getPackageVersions(repoUrl: string) {
  const [owner, repo] = parseRepoUrl(repoUrl);
  const q = `filename:package.json repo:${owner}/${repo}`;
  const packageFiles = await octokit.rest.search.code({ q });

  const versions = await Promise.all(
    packageFiles.data.items.map(async (file) => {
      const content = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: file.path,
      });

      
      // Skip if content is not a file or doesn't have content
      if (!('content' in content.data)) {
        return {};
      }
      
      try {
        const decoded = Buffer.from(content.data.content, 'base64').toString();
        const packageJson = JSON.parse(decoded);
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        return Object.entries(deps)
          .filter(([name]) => name in PACKAGES)
          .reduce((acc, [name, version]) => {
            const displayName = PACKAGES[name as keyof typeof PACKAGES];
            if (!acc[displayName] || semver.lt(version, acc[displayName])) {
              acc[displayName] = version;
            }
            return acc;
          }, {});
      } catch (error) {
        console.warn(`Error parsing package.json in ${file.path}:`, error);
        return {};
      }
    })
  );

  // Merge all found versions, taking the lowest occurrence of each package
  const mergedVersions = versions.reduce((acc, curr) => {
    Object.entries(curr).forEach(([name, version]) => {
      if (!acc[name] || semver.lt(version, acc[name])) {
        acc[name] = version;
      }
    });
    return acc;
  }, {});

  // Prettify the versions
  const prettifiedVersions = Object.entries(mergedVersions).reduce((acc, [name, version]) => {
    const coercedVersion = semver.coerce(version);
    if (coercedVersion) {
      if (coercedVersion.major > 0) {
        acc[name] = `${coercedVersion.major}`;
      } else if (coercedVersion.minor > 0) {
        acc[name] = `${coercedVersion.major}.${coercedVersion.minor}`;
      } else {
        acc[name] = `${coercedVersion.major}.${coercedVersion.minor}.${coercedVersion.patch}`;
      }
    }
    return acc;
  }, {});

  return prettifiedVersions;
}

async function getRepoInfo(repoUrl: string): Promise<RepoInfo> {
  console.log(`Fetching data for ${repoUrl}...`);
  const [owner, repo] = parseRepoUrl(repoUrl);
  const [repoData, pulls, securityAdvisories, dependabotAlerts, codeScanningAlerts, secretScanningAlerts, languages, packageVersions] = await Promise.all([
    octokit.rest.repos.get({ owner, repo }),
    octokit.rest.pulls.list({ owner, repo, state: 'open' }),
    octokit.rest.securityAdvisories.listRepositoryAdvisories({ owner, repo }),
    octokit.rest.dependabot.listAlertsForRepo({ owner, repo, state: 'open' }).catch(() => {}),
    octokit.rest.codeScanning.listAlertsForRepo({ owner, repo, state: 'open' }).catch(() => {}),
    octokit.rest.secretScanning.listAlertsForRepo({ owner, repo, state: 'open' }).catch(() => {}),
    octokit.rest.repos.listLanguages({ owner, repo }),
    getPackageVersions(repoUrl)
  ]);

  return {
    name: repoData.data.full_name,
    description: repoData.data.description ?? '',
    topics: repoData.data.topics ?? [],
    languages: Object.keys(languages.data),
    stars: repoData.data.stargazers_count,
    forks: repoData.data.forks_count,
    openIssues: repoData.data.open_issues_count - pulls.data.length,
    openPullRequests: pulls.data.length,
    securityAlerts: {
      advisories: securityAdvisories?.data.length,
      dependabot: dependabotAlerts?.data.length,
      codeScanning: codeScanningAlerts?.data.length,
      secretScanning: secretScanningAlerts?.data.length
    },
    lastCommitDate: repoData.data.pushed_at,
    packageVersions,
  };
}

async function getReposInfo(repos: string[]): Promise<RepoInfo[]> {
  return Promise.all(
    repos.map(async (repo) => {
      try {
        return await getRepoInfo(repo.trim());
      } catch (error) {
        console.error(`Error fetching data for ${repo}:`, error);
        process.exit(1);
      }
    })
  );
}

async function main() {
  const partialRepoName = process.argv[2] ?? '';
  const reposFile = readFileSync(REPOS_LIST, 'utf8');
  const repos = reposFile
    .split('\n')
    .map(line => line?.trim())
    .filter(line => line && line.startsWith('http'))
    .filter(line => !partialRepoName || line.includes(partialRepoName));

  console.log(`Found ${repos.length} repositories in ${REPOS_LIST}`);
  const reposData = await getReposInfo(repos);

  console.log(`Writing data to ${OUTPUT_FILE} for ${reposData.length} repositories...`);
  writeFileSync(OUTPUT_FILE, JSON.stringify(reposData, null, 2));
}

await main().catch(console.error);
