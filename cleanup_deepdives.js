// /home/amit_pso/LuminaProjectAdmin/cleanup_deepdives.js

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

async function cleanupDeepDives() {
  console.log('Starting process to remove "deepDiveContent" from "Trending Topic" and "Positive News" articles.');

  const articlesRef = db.collection('articles');
  const snapshot = await articlesRef
    .where('articleType', 'in', ['Trending Topic', 'Positive News'])
    .get();

  if (snapshot.empty) {
    console.log('\nNo articles found that need cleanup. Nothing to do.');
    return;
  }

  const batch = db.batch();
  snapshot.forEach(doc => {
    console.log(`  - Scheduling cleanup for article: ${doc.id}`);
    batch.update(doc.ref, { deepDiveContent: admin.firestore.FieldValue.delete() });
  });

  await batch.commit();
  console.log(`\nProcess complete. Successfully cleaned up ${snapshot.size} articles.`);
}

cleanupDeepDives().catch(error => {
    console.error("An error occurred during the cleanup process:", error);
});