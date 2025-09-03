import 'package:flutter/material.dart';
import 'package:consumer_app/models/article.dart'; // Make sure this path is correct for your Article model
import 'package:consumer_app/theme/article_themes.dart'; // Import the themes
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';

class ArticleFeedCard extends StatelessWidget {
  final Article article;

  const ArticleFeedCard({Key? key, required this.article}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Determine the theme based on the article type, with a fallback to the default.
    final theme = articleTypeThemes[article.articleType] ?? defaultTheme;

    return Container(
      color: theme.base, // Use the theme's base color for the background
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top 35% for an image.
            Container(
              height: MediaQuery.of(context).size.height * 0.35,
              width: double.infinity,
              color: Colors.grey[200],
              // Added key to force refresh cached image when URL is the same
              key: ValueKey(article.imageUrl),
              //Explicitly define headers

              child: (article.imageUrl != null && article.imageUrl!.isNotEmpty)
                  ? CachedNetworkImage(
                      imageUrl: article.imageUrl!,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Center(
                        child: CircularProgressIndicator(
                          color: theme.accent,
                         ),
                       headers: {
                         'Cache-Control': 'no-cache',
                        ),
                      ),
                      errorWidget: (context, url, error) => Center(
                        child: Text(
                          'Lumina',
                          style: GoogleFonts.lato(
                            fontSize: 48,
                            fontWeight: FontWeight.bold,
                            color: Colors.black.withOpacity(0.15),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: Text(
                        'Lumina',
                        style: GoogleFonts.lato(
                          fontSize: 48,
                          fontWeight: FontWeight.bold,
                          color: Colors.black.withOpacity(0.15),
                        ),
                      ),
                    ),
            ),
            // Content section with title and scrollable flash content.
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      article.displayTitle ?? article.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.lato(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: theme.text, // Use theme's primary text color
                      ),
                    ),
                    const SizedBox(height: 16),
                    // The content now fits without scrolling inside the card.
                    Expanded(
                      child: Text(
                        article.flashContent ?? 'No summary available.',
                        style: GoogleFonts.lato(
                          fontSize: 16,
                          color: theme
                              .textSecondary, // Use theme's secondary text color
                          height: 1.5, // Keep line height for readability
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Bottom bar, fixed at the bottom of the view.
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
              child: _buildBottomBar(context, article, theme),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomBar(
    BuildContext context,
    Article article,
    ArticleTheme theme,
  ) {
    final hasDeepDive =
        article.articleType == 'Misinformation' &&
        (article.deepDiveContent?.isNotEmpty ?? false);

    final readLink = hasDeepDive ? '#/view/${article.id}' : article.sourceUrl;
    final readButtonText = hasDeepDive
        ? 'Read Full Story'
        : 'Read at ${article.sourceTitle ?? 'Source'}';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Source Info
        Expanded(
          flex: 2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Source',
                style: GoogleFonts.lato(
                  color: theme.textSecondary,
                  fontSize: 12,
                ),
              ),
              Text(
                article.sourceTitle ?? 'N/A',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.lato(
                  fontWeight: FontWeight.bold,
                  color: theme.text,
                ),
              ),
            ],
          ),
        ),
        // Read Button
        Expanded(
          flex: 3,
          child: Center(
            child: ElevatedButton(
              onPressed: () async {
                if (readLink != null && readLink.isNotEmpty) {
                  if (hasDeepDive) {
                    // TODO: Navigate to your deep dive detail screen
                    // For now, we'll just show a snackbar as a placeholder.
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          "Navigating to deep dive for ${article.id}",
                        ),
                      ),
                    );
                  } else {
                    final uri = Uri.parse(readLink);
                    if (await canLaunchUrl(uri)) {
                      await launchUrl(
                        uri,
                        mode: LaunchMode.externalApplication,
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Could not launch $readLink')),
                      );
                    }
                  }
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12, // Reduced vertical padding
                ),
                textStyle: GoogleFonts.lato(fontWeight: FontWeight.bold),
              ),
              child: FittedBox(
                fit: BoxFit.scaleDown, // Scales text down to fit in one line
                child: Text(readButtonText),
              ),
            ),
          ),
        ),
        // Share Button
        Expanded(
          flex: 2,
          child: Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              icon: Icon(Icons.share, color: theme.text),
              onPressed: () {
                // TODO: Replace with your app's public URL
                final shareUrl =
                    'https://your-app-domain.com/#/view/${article.id}';
                Share.share('Read on Lumina: ${article.title}\n$shareUrl');
              },
            ),
          ),
        ),
      ],
    );
  }
}
