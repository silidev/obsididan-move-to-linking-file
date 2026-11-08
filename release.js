#!/usr/bin/env node

/**
 * Release script for Obsidian plugin: Move to Linking File
 * 
 * Automates:
 * 1. Syntax check on main.js (node --check main.js)
 * 2. Uncommitted changes check (git status --porcelain)
 * 3. Reading version from manifest.json
 * 4. Tag check (ensures version is not already released)
 * 5. Extracting release notes from README.md changelog
 * 6. Pushing unpushed commits to origin
 * 7. Creating and pushing git tag
 * 8. Creating GitHub Release via GitHub API
 * 9. Uploading manifest.json, main.js (and styles.css if present)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();

  // Retrieve token from Git Credential Manager
  try {
    const creds = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = creds.match(/password=(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (e) {
    // ignore
  }

  return null;
}

function getRepoInfo() {
  const url = exec('git remote get-url origin');
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Unable to determine GitHub owner/repo from remote URL: "${url}"`);
  }
  return { owner: match[1], repo: match[2] };
}

function extractChangelog(version, readmePath) {
  if (!fs.existsSync(readmePath)) return version;
  const content = fs.readFileSync(readmePath, 'utf8');
  const escaped = version.replace(/\./g, '\\.');
  const regex = new RegExp(`(?:^|\n)###\\s+${escaped}\\b([\\s\\S]*?)(?=(?:\n###\\s+)|$)`);
  const match = content.match(regex);
  if (match) {
    return match[0].trim();
  }
  return version;
}

async function main() {
  console.log('🚀 Starting release process...\n');

  // 1. Syntax check
  console.log('🔍 Checking syntax of main.js...');
  try {
    exec('node --check main.js');
    console.log('✅ Syntax valid.\n');
  } catch (err) {
    console.error('❌ Syntax error in main.js:');
    console.error(err.stderr || err.message);
    process.exit(1);
  }

  // 2. Git status check
  const status = exec('git status --porcelain');
  if (status) {
    console.error('❌ Working tree has uncommitted changes. Please commit or stash first:\n');
    console.error(status);
    process.exit(1);
  }

  // 3. Read manifest.json
  const manifestPath = path.resolve('manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ manifest.json not found.');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version = manifest.version;
  if (!version) {
    console.error('❌ "version" field missing in manifest.json.');
    process.exit(1);
  }
  console.log(`📦 Target version: ${version}`);

  // 4. Check if tag already exists locally or remotely
  const localTag = exec(`git tag -l ${version}`);
  if (localTag === version) {
    console.error(`❌ Git tag "${version}" already exists locally. Bump version in manifest.json first.`);
    process.exit(1);
  }

  const remoteTag = exec(`git ls-remote --tags origin refs/tags/${version}`);
  if (remoteTag) {
    console.error(`❌ Git tag "${version}" already exists on remote. Bump version in manifest.json first.`);
    process.exit(1);
  }

  // 5. Check GitHub token
  const token = getGitHubToken();
  if (!token) {
    console.error('❌ Could not retrieve GitHub token.');
    console.error('   Please set GITHUB_TOKEN environment variable or configure git credentials.');
    process.exit(1);
  }

  const { owner, repo } = getRepoInfo();
  console.log(`📁 GitHub repo: ${owner}/${repo}`);

  // 6. Push any unpushed commits
  try {
    console.log('⬆️  Pushing commits to origin...');
    exec('git push origin HEAD');
    console.log('✅ Git branch up to date.');
  } catch (err) {
    console.warn('⚠️  Could not push branch: ' + (err.stderr || err.message));
  }

  // 7. Create and push tag
  console.log(`🏷️  Creating git tag "${version}"...`);
  exec(`git tag ${version}`);
  console.log(`⬆️  Pushing tag "${version}" to origin...`);
  exec(`git push origin ${version}`);
  console.log('✅ Tag pushed.\n');

  // 8. Extract changelog
  const changelog = extractChangelog(version, path.resolve('README.md'));
  console.log('📝 Release notes:');
  console.log('--------------------------------------------------');
  console.log(changelog);
  console.log('--------------------------------------------------\n');

  // 9. Create GitHub Release
  console.log('🌐 Creating release on GitHub...');
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'NodeReleaseScript'
    },
    body: JSON.stringify({
      tag_name: version,
      name: version,
      body: changelog,
      draft: false,
      prerelease: false
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error(`❌ Failed to create GitHub release (${createRes.status}): ${errText}`);
    process.exit(1);
  }

  const releaseData = await createRes.json();
  console.log(`✅ Release created: ${releaseData.html_url}\n`);

  // 10. Upload assets
  const uploadBaseUrl = releaseData.upload_url.replace(/\{\?name,label\}/, '');
  const filesToUpload = ['manifest.json', 'main.js'];
  if (fs.existsSync('styles.css')) {
    filesToUpload.push('styles.css');
  }

  for (const file of filesToUpload) {
    const filePath = path.resolve(file);
    const fileBytes = fs.readFileSync(filePath);
    console.log(`📤 Uploading ${file}...`);
    const uploadRes = await fetch(`${uploadBaseUrl}?name=${encodeURIComponent(file)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'NodeReleaseScript'
      },
      body: fileBytes
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`❌ Failed to upload asset ${file} (${uploadRes.status}): ${errText}`);
    } else {
      console.log(`✅ ${file} uploaded.`);
    }
  }

  console.log(`\n🎉 Successfully released ${version}!`);
  console.log(`🔗 Release URL: ${releaseData.html_url}`);
}

main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
