#!/usr/bin/env node
// Releases the frontend or the backend on its own version line.
//
//   npm run release -- backend minor       1.0.0 → 1.1.0
//   npm run release -- frontend 2.0.0      explicit version
//
// Bumps <app>/package.json, moves the "Unreleased" notes in <app>/CHANGELOG.md under the new
// version, commits, and creates the tag <app>-v<version>. Nothing is pushed: review, then run
//   git push --follow-tags
// and the "Release" GitHub workflow tests the app, builds its Docker image and publishes the release.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const APPS = ['frontend', 'backend'];
const [app, bump] = process.argv.slice(2);

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = current.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  fail(`unknown bump "${bump}" (use major, minor, patch or x.y.z)`);
}

function releaseChangelog(changelog, version, date) {
  const heading = '## Unreleased';
  if (!changelog.includes(heading)) fail('CHANGELOG.md has no "## Unreleased" section');
  return changelog.replace(heading, `${heading}\n\n## ${version} (${date})`);
}

if (!APPS.includes(app) || !bump) fail('usage: npm run release -- <frontend|backend> <major|minor|patch|x.y.z>');
if (git('status', '--porcelain')) fail('commit or stash your changes first');

const manifestPath = `${app}/package.json`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = nextVersion(manifest.version, bump);
const tag = `${app}-v${version}`;
if (git('tag', '--list', tag)) fail(`${tag} already exists`);

manifest.version = version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const changelogPath = `${app}/CHANGELOG.md`;
writeFileSync(changelogPath, releaseChangelog(readFileSync(changelogPath, 'utf8'), version, new Date().toISOString().slice(0, 10)));
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { stdio: 'inherit' });

git('add', manifestPath, changelogPath, 'package-lock.json');
git('commit', '-m', `release(${app}): v${version}`);
git('tag', '-a', tag, '-m', `${app} ${version}`);
console.log(`\nTagged ${tag}. Publish it with:\n  git push --follow-tags\n`);
