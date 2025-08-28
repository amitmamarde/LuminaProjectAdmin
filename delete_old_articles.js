// /home/amit_pso/LuminaProjectAdmin/delete_old_articles.js

import admin from 'firebase-admin';

// --- IMPORTANT ---
// 1. Download your service account key JSON file from the Firebase console:
//    Project settings > Service accounts > Generate new private key.
// 2. Save it as 'serviceAccountKey.json' in the same directory as this script.
// 3. **DO NOT** commit this key to your git repository. Add it to .gitignore.
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Deletes articles from Firestore created on or before a specified date.
 *
 * Usage:
 * - For a dry run (shows what would be deleted):
 *   node delete_old_articles.js YYYY-MM-DD --dry-run
 *
 * - To perform the actual deletion:
 *   node delete_old_articles.js YYYY-MM-DD --confirm-delete
 */
async function deleteOldArticles() {
  const args = process.argv.slice(2);
  const dateArg = args.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  const isDryRun = args.includes('--dry-run');
  const isConfirmed = args.includes('--confirm-delete');

  if (!dateArg || (!isDryRun && !isConfirmed)) {
    console.error('\nERROR: Invalid arguments.');
    console.error('Please provide a date in YYYY-MM-DD format and a mode flag.');
    console.error('\nUsage:');
    console.error('  Dry Run (to see what will be deleted):');
    console.error('    node delete_old_articles.js YYYY-MM-DD --dry-run');
    console.error('\n  Confirm Deletion (this is permanent!):');
    console.error('    node delete_old_articles.js YYYY-MM-DD --confirm-delete\n');
    return;
  }

  if (isDryRun && isConfirmed) {
    console.error('\nERROR: Cannot use --dry-run and --confirm-delete at the same time.');
    return;
  }

  // Create a UTC date object for the end of the specified day to include all articles from that day.
  // Appending 'T23:59:59.999Z' makes the time and UTC timezone explicit, avoiding potential parsing issues.
  const cutoffDate = new Date(`${dateArg}T23:59:59.999Z`);

  // Validate that the date was parsed correctly.
  if (isNaN(cutoffDate.getTime())) {
    console.error(`\nERROR: Invalid date created from argument: ${dateArg}`);
    console.error('Please ensure the date is in YYYY-MM-DD format.');
    return;
  }

  // Convert the JavaScript Date to a Firestore Timestamp for a more robust query.
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

  const articlesRef = db.collection('articles');

  console.log(`\nFinding articles created on or before: ${cutoffDate.toISOString()}`);
  const snapshot = await articlesRef.where('createdAt', '<=', cutoffTimestamp).get();

  if (snapshot.empty) {
    console.log('\nNo articles found matching the criteria. Nothing to do.');
    return;
  }

  console.log(`Found ${snapshot.size} articles to process.`);

  if (isDryRun) {
    console.log('\n--- DRY RUN MODE ---');
    console.log('The following articles would be deleted:');
    snapshot.forEach(doc => {
      console.log(`  - ID: ${doc.id}, Title: "${doc.data().title}", Created: ${doc.data().createdAt.toDate().toISOString()}`);
    });
    console.log('\nNo data was changed. Run with --confirm-delete to proceed with deletion.');
    return;
  }

  if (isConfirmed) {
    console.log('\n--- CONFIRMED DELETION ---');
    // Firestore batches are limited to 500 operations. Process in chunks.
    const batchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const chunk = snapshot.docs.slice(i, i + batchSize);
      const batch = db.batch();
      
      chunk.forEach(doc => {
        console.log(`  - Scheduling deletion for article: ${doc.id}`);
        batch.delete(doc.ref);
      });

      await batch.commit();
      deletedCount += chunk.length;
      console.log(`  ...committed batch ${Math.floor(i / batchSize) + 1}, deleted ${chunk.length} articles.`);
    }

    console.log(`\nProcess complete. Successfully deleted ${deletedCount} articles.`);
  }
}

deleteOldArticles().catch(error => {
    console.error("\nAn unexpected error occurred:", error);
});