import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import SOURCE_REGISTRY from './source-registry.json' with { type: 'json' };
import fs from 'fs/promises';
import path from 'path';

// --- Configuration ---
// Number of days to look back for statistics.
const DAYS_TO_QUERY = 30;
const OUTPUT_FILE = 'article_stats_report.txt';
// -------------------

/**
 * A script to fetch and display statistics about articles created in Firestore.
 * Run from Google Cloud Shell.
 */
async function getArticleStats() {
    try {
        // When running in a Google Cloud environment like Cloud Shell, the SDK
        // can automatically find the project and credentials.
        console.log("Initializing Firebase Admin SDK...");
        admin.initializeApp({
            projectId: process.env.GCLOUD_PROJECT, // Uses the project set in your Cloud Shell
        });
        const db = getFirestore();
        console.log("Successfully connected to Firestore.");

        // Calculate the start date for the query.
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - DAYS_TO_QUERY);
        const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);

        console.log(`\nFetching articles created in the last ${DAYS_TO_QUERY} days...`);
        const articlesRef = db.collection('articles');
        const snapshot = await articlesRef.where('createdAt', '>=', startTimestamp).get();

        if (snapshot.empty) {
            const emptyReportMessage = `No articles found in the last ${DAYS_TO_QUERY} days.`;
            console.log(emptyReportMessage);
            const outputPath = path.resolve(process.cwd(), OUTPUT_FILE);
            await fs.writeFile(outputPath, emptyReportMessage);
            console.log(`\n✅ Report file created at: ${outputPath}`);
            return; // Exit after writing the empty report.
        }

        console.log(`Found ${snapshot.size} articles to analyze.`);

        const statsByDate = {};
        const statsByType = {};
        const statsByCategory = {};
        const statsBySource = {};

        snapshot.forEach(doc => {
            const data = doc.data();

            // 1. Stats by creation date
            if (data.createdAt) {
                const date = data.createdAt.toDate().toISOString().split('T')[0];
                statsByDate[date] = (statsByDate[date] || 0) + 1;
            }

            // 2. Stats by article type
            if (data.articleType) {
                statsByType[data.articleType] = (statsByType[data.articleType] || 0) + 1;
            }

            // 3. Stats by category
            if (data.categories && Array.isArray(data.categories)) {
                data.categories.forEach(category => {
                    statsByCategory[category] = (statsByCategory[category] || 0) + 1;
                });
            }

            // 4. Stats by source and date
            if (data.sourceTitle && data.createdAt) {
                const source = data.sourceTitle.trim();
                const date = data.createdAt.toDate().toISOString().split('T')[0];
                if (!statsBySource[source]) {
                    statsBySource[source] = { total: 0, dates: {} };
                }
                statsBySource[source].dates[date] = (statsBySource[source].dates[date] || 0) + 1;
                statsBySource[source].total++;
            }
        });

        // --- Display Results ---
        const reportLines = [];

        reportLines.push(`--- Article Creation Stats (Last ${DAYS_TO_QUERY} Days) ---`);
        reportLines.push(`\nTotal Articles Created: ${snapshot.size}`);

        // Articles by Date
        reportLines.push("\n--- Articles by Date ---");
        const sortedDates = Object.keys(statsByDate).sort((a, b) => new Date(b) - new Date(a));
        for (const date of sortedDates) {
            reportLines.push(`${date}: ${statsByDate[date]}`);
        }

        // Articles by Type
        reportLines.push("\n--- Articles by Type ---");
        const sortedTypes = Object.keys(statsByType).sort((a, b) => statsByType[b] - statsByType[a]);
        for (const type of sortedTypes) {
            reportLines.push(`${type.padEnd(25)}: ${statsByType[type]}`);
        }

        // Articles by Category
        reportLines.push("\n--- Articles by Category ---");
        if (Object.keys(statsByCategory).length > 0) {
            const sortedCategories = Object.keys(statsByCategory).sort((a, b) => statsByCategory[b] - statsByCategory[a]);
            for (const category of sortedCategories) {
                reportLines.push(`${category.padEnd(25)}: ${statsByCategory[category]}`);
            }
        } else {
            reportLines.push("No articles with categories found.");
        }

        // Articles by Source
        reportLines.push("\n--- Articles by Source (and Date) ---");
        if (Object.keys(statsBySource).length > 0) {
            // Sort sources by the total number of articles they produced
            const sortedSources = Object.keys(statsBySource).sort((a, b) => statsBySource[b].total - statsBySource[a].total);
            for (const source of sortedSources) {
                reportLines.push(`\n${source} (Total: ${statsBySource[source].total})`);
                const sortedSourceDates = Object.keys(statsBySource[source].dates).sort((a, b) => new Date(b) - new Date(a));
                for (const date of sortedSourceDates) {
                    reportLines.push(`  - ${date}: ${statsBySource[source].dates[date]} articles`);
                }
            }
        } else {
            reportLines.push("No articles with a source title were found.");
        }

        // --- Sources with Zero Articles ---
        reportLines.push("\n--- RSS Sources with Zero Articles ---");
        const allRssSourceNames = new Set();
        for (const pillar in SOURCE_REGISTRY.sources) {
            for (const region in SOURCE_REGISTRY.sources[pillar]) {
                if (region === 'notes') continue;
                const allowlist = SOURCE_REGISTRY.sources[pillar][region].allowlist || [];
                allowlist.forEach(source => {
                    if (source.rssUrl && source.sourceName) {
                        allRssSourceNames.add(source.sourceName.trim());
                    }
                });
            }
        }

        const productiveSourceNames = new Set(Object.keys(statsBySource));
        const zeroArticleSources = [...allRssSourceNames].filter(name => !productiveSourceNames.has(name));

        if (zeroArticleSources.length > 0) {
            reportLines.push(`The following ${zeroArticleSources.length} sources from the registry produced 0 articles in the last ${DAYS_TO_QUERY} days:`);
            zeroArticleSources.sort().forEach(name => reportLines.push(`  - ${name}`));
        } else {
            reportLines.push(`All RSS sources in the registry have produced at least one article in the last ${DAYS_TO_QUERY} days. Great!`);
        }

        // --- Write to file ---
        const reportContent = reportLines.join('\n');
        const outputPath = path.resolve(process.cwd(), OUTPUT_FILE);
        await fs.writeFile(outputPath, reportContent);
        console.log(`\n✅ Success! Report has been saved to: ${outputPath}`);

        console.log("\n--- End of Script ---");

    } catch (error) {
        console.error("\nAn error occurred while generating statistics:", error);
        console.error("\nPlease ensure you are running this in a Google Cloud Shell environment and have the correct project selected (`gcloud config set project YOUR_PROJECT_ID`).");
        process.exit(1);
    }
}

getArticleStats();
