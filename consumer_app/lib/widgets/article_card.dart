import 'package:cached_network_image/cached_network_image.dart';
import 'package:consumer_app/models/article.dart';
import 'package:consumer_app/theme/article_themes.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class ArticleCard extends StatelessWidget {
  final Article article;

  const ArticleCard({Key? key, required this.article}) : super(key: key);

  void _launchURL(BuildContext context, String url) async {
    if (!await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    )) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not launch $url')));
    }
  }

  @override
  Widget build(BuildContext context) {
    // 1. Get the appropriate theme for the article type
    final theme = getThemeForArticleType(article.articleType);
    final textTheme = Theme.of(context).textTheme;

    // Determine the navigation target
    final bool hasDeepDive =
        article.articleType == 'Misinformation' &&
        (article.deepDiveContent?.isNotEmpty ?? false);

    return GestureDetector(
      onTap: () {
        if (hasDeepDive) {
          // TODO: Navigate to your app's detail screen
          // Example: Navigator.of(context).push(MaterialPageRoute(builder: (_) => ArticleDetailScreen(articleId: article.id)));
          print("Navigate to detail screen for ${article.id}");
        } else if (article.sourceUrl != null) {
          // Launch external URL
          _launchURL(context, article.sourceUrl!);
        }
      },
      child: Card(
        // 2. Apply the base color to the card
        color: theme.base,
        elevation: 2,
        margin: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        clipBehavior:
            Clip.antiAlias, // Ensures the image respects the rounded corners
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (article.imageUrl != null)
              CachedNetworkImage(
                imageUrl: article.imageUrl!,
                height: 200,
                width: double.infinity,
                fit: BoxFit.cover,
                placeholder: (context, url) => Container(
                  height: 200,
                  color: Colors.grey[300],
                  child: Center(
                    child: CircularProgressIndicator(color: theme.accent),
                  ),
                ),
                errorWidget: (context, url, error) => Container(
                  height: 200,
                  color: Colors.grey[300],
                  child: Icon(Icons.broken_image, color: Colors.grey[600]),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (article.categories.isNotEmpty)
                    Text(
                      article.categories.join(', ').toUpperCase(),
                      // 3. Apply the accent color to categories/tags
                      style: textTheme.labelSmall?.copyWith(
                        color: theme.accent,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.8,
                      ),
                    ),
                  if (article.categories.isNotEmpty) const SizedBox(height: 8),
                  Text(
                    article.title,
                    // 4. Apply the main text color to the title
                    style: textTheme.titleLarge?.copyWith(
                      color: theme.text,
                      fontWeight: FontWeight.bold,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  if (article.flashContent != null)
                    Text(
                      article.flashContent!,
                      // 5. Apply the secondary text color to the summary
                      style: textTheme.bodyMedium?.copyWith(
                        color: theme.textSecondary,
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
