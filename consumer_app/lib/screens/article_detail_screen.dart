import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/article.dart';
import 'package:share_plus/share_plus.dart';
import '../theme/article_themes.dart'; // Import themes for consistency

/// This screen displays the primary "flash card" view for an article,
/// styled similarly to apps like Inshorts.
class ArticleDetailScreen extends StatelessWidget {
  final Article article;

  const ArticleDetailScreen({super.key, required this.article});

  @override
  Widget build(BuildContext context) {
    // Use the same theme logic as the feed card for consistency
    final theme = articleTypeThemes[article.articleType] ?? defaultTheme;

    final bool hasDeepDive = article.articleType == 'Misinformation';
    final String readButtonText =
        hasDeepDive ? 'Read Full Story' : 'Read at ${article.sourceTitle ?? 'Source'}';

    // Determine the primary image URL to use, falling back to the source logo.
    final primaryImageUrl = (article.imageUrl != null && article.imageUrl!.isNotEmpty)
        ? article.imageUrl
        : article.sourceLogoUrl;

    // Build the proxied image URL if a primary URL exists.
    String? proxiedImageUrl;
    if (primaryImageUrl != null && primaryImageUrl.isNotEmpty) {
      final encodedUrl = Uri.encodeComponent(primaryImageUrl);
      proxiedImageUrl = '/imageProxy?url=$encodedUrl';
    }

    return Scaffold(
      backgroundColor: theme.base, // Use theme color
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Image placeholder (40% of screen height)
          SizedBox(
            height: MediaQuery.of(context).size.height * 0.4,
            child: (proxiedImageUrl != null)
                ? CachedNetworkImage(
                    imageUrl: proxiedImageUrl,
                    fit: BoxFit.cover,
                    placeholder: (context, url) =>
                        Center(child: CircularProgressIndicator(color: theme.accent)),
                    errorWidget: (context, url, error) =>
                        _buildFallbackImage(context, theme, article.sourceLogoUrl),
                  )
                : _buildLuminaPlaceholder(theme),
          ),
          // 2. Content area (remaining 60%)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    article.displayTitle ?? article.title,
                    style: GoogleFonts.lato(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: theme.text,
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Text(
                        article.flashContent ?? 'Summary not available.',
                        style: GoogleFonts.lato(
                          fontSize: 16,
                          color: theme.textSecondary,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // The bottom action row
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // Left: Source
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Source',
                                  style:
                                      TextStyle(color: theme.textSecondary, fontSize: 12)),
                              Text(
                                article.sourceTitle ?? 'N/A',
                                style: TextStyle(
                                    color: theme.text,
                                    fontWeight: FontWeight.bold),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        // Middle: Read Button
                        ElevatedButton(
                          onPressed: () => _launchAction(context),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: theme.accent,
                            foregroundColor: theme.base,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(30)),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 24, vertical: 12),
                          ),
                          child: Text(readButtonText,
                              style:
                                  const TextStyle(fontWeight: FontWeight.bold)),
                        ),
                        // Right: Share Button
                        Expanded(
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: IconButton(
                              icon: Icon(Icons.share, color: theme.text),
                              onPressed: () => _shareArticle(context),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// A helper widget to build the fallback image view.
  /// It first tries to load the source logo, and if that fails, shows the Lumina placeholder.
  Widget _buildFallbackImage(
      BuildContext context, ArticleTheme theme, String? sourceLogoUrl) {
    // If a source logo URL is available, try to display it.
    if (sourceLogoUrl != null && sourceLogoUrl.isNotEmpty) {
      final encodedUrl = Uri.encodeComponent(sourceLogoUrl);
      final proxiedLogoUrl = '/imageProxy?url=$encodedUrl';

      return CachedNetworkImage(
        imageUrl: proxiedLogoUrl,
        fit: BoxFit.contain, // Use contain to show the whole logo without cropping
        placeholder: (context, url) => Center(
            child: CircularProgressIndicator(color: theme.accent)),
        // If even the logo fails, show the final placeholder.
        errorWidget: (context, url, error) => _buildLuminaPlaceholder(theme),
      );
    }

    // If no source logo is available, show the Lumina placeholder directly.
    return _buildLuminaPlaceholder(theme);
  }

  /// The final placeholder widget with the "Lumina" text.
  Widget _buildLuminaPlaceholder(ArticleTheme theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('Lumina',
              style: GoogleFonts.lato(
                fontSize: 48,
                fontWeight: FontWeight.bold,
                color: Colors.black.withOpacity(0.15),
              )),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: Text('Image not available',
                textAlign: TextAlign.center,
                style: TextStyle(color: theme.textSecondary)),
          )
        ],
      ),
    );
  }

  void _launchAction(BuildContext context) {
    final bool hasDeepDive = article.articleType == 'Misinformation';
    // For Misinformation, link to the web deep-dive. Otherwise, link to the original source.
    // The URL should point to the consumer web app, not the admin panel.
    final String urlToLaunch = hasDeepDive
        ? 'https://lumina-summaries.web.app/#/view/${article.id}'
        : article.sourceUrl ?? '';

    if (urlToLaunch.isNotEmpty) {
      launchUrl(Uri.parse(urlToLaunch), mode: LaunchMode.externalApplication);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open link.')),
      );
    }
  }

  void _shareArticle(BuildContext context) {
    // The URL must point to the consumer web app.
    final String shareUrl = 'https://lumina-summaries.web.app/#/view/${article.id}';
    final String effectiveTitle = article.displayTitle ?? article.title;
    final String shareText = '$effectiveTitle\n\nRead more on Lumina:';

    Share.share('$shareText $shareUrl', subject: effectiveTitle);
  }
}