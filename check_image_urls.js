// /home/amit_pso/LuminaProjectAdmin/check_image_urls.js

import admin from 'firebase-admin';

// ANSI colors for pretty console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const REQUEST_TIMEOUT = 10000; // 10 seconds

// --- Initialize Firebase Admin SDK ---
// In Cloud Shell, if you've authenticated with `gcloud auth login` and set your project,
// this will use Application Default Credentials automatically without extra configuration.
try {
  admin.initializeApp({
    projectId: 'lumina-summaries', // Explicitly setting project ID for clarity
  });
} catch (e) {
  // This prevents a crash if the script is run multiple times and the app is already initialized.
  if (e.code !== 'app/duplicate-app') {
    console.error(`${colors.red}Firebase Admin SDK initialization failed:${colors.reset}`, e);
    process.exit(1);
  }
}

const db = admin.firestore();

/**
 * Checks if an image URL is reachable by making a HEAD request.
 * @param {string} url The URL of the image to check.
 * @returns {Promise<{status: 'Reachable' | 'Unreachable', statusCode: number | null, error: string | null}>}
 */
async function checkUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    // We use a HEAD request because it's more efficient. It asks for the headers
    // of the resource without downloading the entire image file.
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Lumina-Image-URL-Checker/1.0' },
      redirect: 'follow' // Follow redirects to get the final status
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return { status: 'Reachable', statusCode: response.status, error: null };
    } else {
      return { status: 'Unreachable', statusCode: response.status, error: `Request failed with HTTP Status ${response.status}` };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    let errorMessage = error.message || 'Unknown fetch error';
    if (error.name === 'AbortError') {
      errorMessage = `Request timed out after ${REQUEST_TIMEOUT / 1000}s`;
    }
    return { status: 'Unreachable', statusCode: null, error: errorMessage };
  }
}

/**
 * Main function to fetch articles and check their image URLs.
 */
async function checkAllImageUrls() {
  console.log(`${colors.cyan}Starting image URL reachability check...${colors.reset}`);
  
  let articlesSnapshot;
  try {
    console.log('Fetching articles with non-null image URLs from Firestore...');
    const articlesRef = db.collection('articles');
    const q = articlesRef.where('imageUrl', '!=', null);
    articlesSnapshot = await q.get();
  } catch (error) {
    console.error(`${colors.red}Error fetching articles from Firestore:${colors.reset}`, error.message);
    return;
  }

  if (articlesSnapshot.empty) {
    console.log('No articles with an `imageUrl` found in the database.');
    return;
  }

  const articlesToTest = articlesSnapshot.docs.map(doc => ({
      id: doc.id,
      title: doc.data().title,
      imageUrl: doc.data().imageUrl
  }));

  console.log(`Found ${articlesToTest.length} articles with image URLs. Checking them now...\n`);

  const checkPromises = articlesToTest.map(article => checkUrl(article.imageUrl).then(result => ({ ...article, ...result })));
  const results = await Promise.all(checkPromises);

  const reachable = results.filter(r => r.status === 'Reachable');
  const unreachable = results.filter(r => r.status === 'Unreachable');

  console.log('--- Image URL Reachability Report ---');
  console.log(`${colors.green}✅ Reachable: ${reachable.length}${colors.reset}`);
  console.log(`${colors.red}🔴 Unreachable: ${unreachable.length}${colors.reset}\n`);

  if (unreachable.length > 0) {
    console.log(`${colors.yellow}--- Details for Unreachable URLs ---${colors.reset}`);
    unreachable.forEach(img => {
      console.log(`\n  ${colors.cyan}Article:${colors.reset} "${img.title}" (ID: ${img.id})`);
      console.log(`  ${colors.yellow}URL:${colors.reset}     ${img.imageUrl}`);
      console.log(`  ${colors.red}Reason:${colors.reset}  ${img.error}`);
    });
  }

  console.log(`\n--- Report Complete ---`);
}

checkAllImageUrls().catch(error => {
  console.error(`${colors.red}\nAn unexpected error occurred during the script execution:${colors.reset}`, error);
  process.exit(1);
});