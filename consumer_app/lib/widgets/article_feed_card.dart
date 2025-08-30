import 'package:flutter/material.dart';
import 'package:consumer_app/models/article.dart'; // Make sure this path is correct for your Article model
import 'package:consumer_app/theme/article_themes.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';

class ArticleFeedCard extends StatelessWidget {
  final Article article;

  const ArticleFeedCard({Key? key, required this.article}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Get the correct theme for the article type, or use a default.
    final theme = articleTypeThemes[article.articleType] ?? defaultTheme;
    final hasImage = article.imageUrl != null && article.imageUrl!.isNotEmpty;

    // Conditionally set colors for readability based on whether there's an image.
    final titleColor = hasImage ? Colors.white : theme.text;
    final contentColor = hasImage ? Colors.grey[200]! : theme.textSecondary;
    final sourceMetaColor = hasImage ? Colors.grey[400]! : theme.textSecondary;
    final sourceTitleColor = hasImage ? Colors.grey[200]! : theme.text;
    final shareIconColor = hasImage ? Colors.white : theme.text;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Layer 1: Base background color from theme.
        // THIS IS THE KEY FIX for the black background issue.
        Container(color: theme.base),

        // Layer 2: Background Image (if it exists)
        if (hasImage)
          CachedNetworkImage(
            imageUrl: article.imageUrl!,
            fit: BoxFit.cover,
            placeholder: (context, url) =>
                Container(color: theme.base.withOpacity(0.5)),
            errorWidget: (context, url, error) => const Icon(Icons.error),
          ),

        // Layer 3: Gradient Overlay (only if there's an image for text readability)
        if (hasImage)
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.black, Colors.black87, Colors.transparent],
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                stops: [0.0, 0.4, 1.0],
              ),
            ),
          ),

        // Layer 4: Content
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  article.title,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.playfairDisplay(
                    fontSize: 32,
                    fontWeight: FontWeight.w700,
                    color: titleColor,
                    shadows: const [
                      Shadow(
                        blurRadius: 8.0,
                        color: Colors.black54,
                        offset: Offset(2, 2),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  article.flashContent ?? '',
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.lato(
                    fontSize: 16,
                    color: contentColor,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 32),
                _buildBottomBar(
                  context,
                  article,
                  sourceMetaColor,
                  sourceTitleColor,
                  shareIconColor,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBottomBar(
    BuildContext context,
    Article article,
    Color sourceMetaColor,
    Color sourceTitleColor,
    Color shareIconColor,
  ) {
    final hasDeepDive =
        article.articleType == 'Misinformation' &&
        (article.deepDiveContent?.isNotEmpty ?? false);
    final readLink = hasDeepDive ? '#/view/${article.id}' : article.sourceUrl;
    final readButtonText = hasDeepDive
        ? 'Read Full Story'
        : 'Read at ${article.sourceTitle ?? 'Source'}';

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Left: Source
        Expanded(
          flex: 2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Source',
                style: GoogleFonts.lato(fontSize: 12, color: sourceMetaColor),
              ),
              Text(
                article.sourceTitle ?? 'N/A',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.lato(
                  fontWeight: FontWeight.bold,
                  color: sourceTitleColor,
                ),
              ),
            ],
          ),
        ),
        // Middle: Read Button
        Expanded(
          flex: 3,
          child: Center(
            child: ElevatedButton(
              onPressed: () async {
                if (readLink != null && readLink.isNotEmpty) {
                  if (hasDeepDive) {
                    // TODO: Navigate to your deep dive detail screen
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          "Navigate to deep dive for ${article.id}",
                        ),
                      ),
                    );
                  } else {
                    if (await canLaunchUrl(Uri.parse(readLink))) {
                      launchUrl(
                        Uri.parse(readLink),
                        mode: LaunchMode.externalApplication,
                      );
                    }
                  }
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 14,
                ),
                textStyle: GoogleFonts.lato(fontWeight: FontWeight.bold),
              ),
              child: Text(readButtonText),
            ),
          ),
        ),
        // Right: Share Button
        Expanded(
          flex: 2,
          child: Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              icon: Icon(Icons.share, color: shareIconColor),
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
