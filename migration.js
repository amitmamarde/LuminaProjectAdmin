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

async function migrateArticleStatus() {
  console.log('Starting migration to change article status from "Queued" back to "GenerationFailed"');

  const articlesRef = db.collection('articles');
  const snapshot = await articlesRef.where('status', '==', 'Queued').get();

  if (snapshot.empty) {
    console.log('No articles with status "Queued" found. Nothing to do.');
    return;
  }

  // Use a write batch to update all documents in a single operation
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    console.log(`  - Scheduling update for article: ${doc.id}`);
    const docRef = articlesRef.doc(doc.id);
    batch.update(docRef, { status: 'GenerationFailed' });
    count++;
  });

  // Commit the batch
  await batch.commit();
  console.log(`\nMigration complete. Successfully updated ${count} articles.`);
}

migrateArticleStatus().catch(error => {
    console.error("An error occurred during migration:", error);
});
