// /home/amit_pso/LuminaProjectAdmin/migration.js

import admin from 'firebase-admin';

// --- IMPORTANT ---
// 1. Download your service account key JSON file from the Firebase console:
//    Project settings > Service accounts > Generate new private key.
// 2. Save it as 'serviceAccountKey.json' in the same directory as this script.
// 3. **DO NOT** commit this key to your git repository. Add it to .gitignore.
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteQueuedArticles() {
  console.log('Starting process to DELETE all articles with "Queued" status.');

  // Safety check: require a command-line argument to proceed with deletion.
  const args = process.argv.slice(2);
  if (!args.includes('--confirm-delete')) {
    console.error('\nERROR: This is a destructive operation.');
    console.error('To proceed, you must run the script with the --confirm-delete flag:');
    console.error('node migration.js --confirm-delete');
    return;
  }

  const articlesRef = db.collection('articles');
  const snapshot = await articlesRef.where('status', '==', 'Queued').get();

  if (snapshot.empty) {
    console.log('\nNo articles with status "Queued" found. Nothing to do.');
    return;
  }

  // Use a write batch to delete all documents in a single operation
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    console.log(`  - Scheduling deletion for article: ${doc.id}`);
    const docRef = articlesRef.doc(doc.id);
    batch.delete(docRef);
    count++;
  });

  // Commit the batch
  await batch.commit();
  console.log(`\nProcess complete. Successfully deleted ${count} articles.`);
}

deleteQueuedArticles().catch(error => {
    console.error("An error occurred during the deletion process:", error);
});
