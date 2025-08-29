// /home/amit_pso/LuminaProjectAdmin/check_rss_feeds.js

import fs from 'fs/promises';
import path from 'path';

// ANSI colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const SOURCE_REGISTRY_PATH = path.join(process.cwd(), 'functions', 'source-registry.json');
const REQUEST_TIMEOUT = 15000; // 15 seconds

/**
 * Checks if a URL is reachable by making a HEAD or GET request.
 * It tries HEAD first for efficiency, then falls back to GET if HEAD fails,
 * as some servers don't support HEAD requests properly.
 * @param {string} url The URL to check.
 * @returns {Promise<{status: 'Reachable' | 'Unreachable', statusCode: number | null, error: string | null}>}
 */
async function checkUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    // Try a HEAD request first as it's more lightweight
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Lumina-RSS-Feed-Checker/1.0' },
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { status: 'Reachable', statusCode: response.status, error: null };
    } else {
      // Fallback to GET if HEAD gives a non-OK status, as some servers might require it.
      return await checkUrlWithGet(url);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { status: 'Unreachable', statusCode: null, error: `Request timed out after ${REQUEST_TIMEOUT / 1000}s` };
    }
    // If HEAD request fails for other reasons (e.g., network error, method not allowed), fallback to GET.
    return await checkUrlWithGet(url);
  }
}

/**
 * Fallback function to check a URL using a GET request.
 * @param {string} url The URL to check.
 * @returns {Promise<{status: 'Reachable' | 'Unreachable', statusCode: number | null, error: string | null}>}
 */
async function checkUrlWithGet(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'Lumina-RSS-Feed-Checker/1.0' },
            redirect: 'follow'
        });
        clearTimeout(timeoutId);
        if (response.ok) {
            return { status: 'Reachable', statusCode: response.status, error: null };
        } else {
            return { status: 'Unreachable', statusCode: response.status, error: `GET request failed with HTTP Status ${response.status}` };
        }
    } catch (error) {
        clearTimeout(timeoutId);
        return { status: 'Unreachable', statusCode: null, error: error.message || 'Unknown fetch error' };
    }
}

/**
 * Main function to read the registry and check all RSS feeds.
 */
async function checkAllRssFeeds() {
  console.log(`${colors.cyan}Starting RSS feed reachability check...${colors.reset}`);
  console.log(`Reading source registry from: ${SOURCE_REGISTRY_PATH}\n`);

  let sourceRegistry;
  try {
    const fileContent = await fs.readFile(SOURCE_REGISTRY_PATH, 'utf-8');
    sourceRegistry = JSON.parse(fileContent);
  } catch (error) {
    console.error(`${colors.red}Error reading or parsing ${SOURCE_REGISTRY_PATH}:${colors.reset}`, error.message);
    return;
  }

  const sourcesToTest = [];
  for (const pillar in sourceRegistry.sources) {
    for (const region in sourceRegistry.sources[pillar]) {
      if (region === 'notes') continue;
      const allowlist = sourceRegistry.sources[pillar][region].allowlist || [];
      for (const source of allowlist) {
        if (source.rssUrl) {
          sourcesToTest.push({ ...source, pillar, region });
        }
      }
    }
  }

  if (sourcesToTest.length === 0) {
    console.log('No sources with an `rssUrl` found in the registry.');
    return;
  }

  console.log(`Found ${sourcesToTest.length} RSS feeds to check. Processing in parallel...\n`);

  const checkPromises = sourcesToTest.map(source =>
    checkUrl(source.rssUrl).then(result => ({ ...source, ...result }))
  );

  const results = await Promise.all(checkPromises);

  const reachableFeeds = results.filter(r => r.status === 'Reachable');
  const unreachableFeeds = results.filter(r => r.status === 'Unreachable');

  // --- Print Report ---
  console.log('--- RSS Feed Reachability Report ---');

  if (unreachableFeeds.length > 0) {
    console.log(`\n${colors.red}🔴 Unreachable Feeds (${unreachableFeeds.length}):${colors.reset}`);
    unreachableFeeds.forEach(feed => {
      console.log(`  - ${colors.yellow}URL:${colors.reset} ${feed.rssUrl}`);
      console.log(`    ${colors.cyan}Context:${colors.reset} ${feed.domain} (Pillar: ${feed.pillar}, Region: ${feed.region})`);
      console.log(`    ${colors.red}Reason:${colors.reset} ${feed.error}`);
    });
  }

  if (reachableFeeds.length > 0) {
    console.log(`\n${colors.green}✅ Reachable Feeds (${reachableFeeds.length}):${colors.reset}`);
  }

  if (unreachableFeeds.length === 0) {
    console.log(`\n${colors.green}Excellent! All ${reachableFeeds.length} feeds are reachable.${colors.reset}`);
  }

  console.log('\n--- Report Complete ---');
  console.log('Review the unreachable feeds above and consider updating or removing them from `source-registry.json`.');
}

checkAllRssFeeds().catch(error => {
  console.error(`${colors.red}\nAn unexpected error occurred during the script execution:${colors.reset}`, error);
});