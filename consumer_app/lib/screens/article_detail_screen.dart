import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/article_model.dart';
import 'package:share_plus/share_plus.dart';

/// This screen displays the primary "flash card" view for an article,
/// styled similarly to apps like Inshorts.
class ArticleDetailScreen extends StatelessWidget {
  final Article article;

  const ArticleDetailScreen({super.key, required this.article});

  @override
  Widget build(BuildContext context) {
    final bool hasDeepDive = article.articleType == 'Misinformation';
    final String readButtonText =
        hasDeepDive ? 'Read Full Story' : 'Read at ${article.sourceTitle ?? 'Source'}';

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Layer 1: Background Image (takes up top ~60% of screen)
          if (article.imageUrl != null && article.imageUrl!.isNotEmpty)
            Positioned.fill(
              child: CachedNetworkImage(
                imageUrl: article.imageUrl!,
                fit: BoxFit.cover,
                placeholder: (context, url) => Container(color: Colors.grey[800]),
                errorWidget: (context, url, error) => Container(
                  color: Colors.grey[800],
                  child: const Icon(Icons.broken_image, color: Colors.grey, size: 50),
                ),
              ),
            ),
          // Layer 2: Gradient overlay for text readability
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    Colors.black.withOpacity(0.4),
                    Colors.black.withOpacity(0.9),
                    Colors.black,
                  ],
                  stops: const [0.0, 0.4, 0.6, 1.0],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),
          // Layer 3: Content and Actions
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    article.title,
                    style: GoogleFonts.lato(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      shadows: [const Shadow(blurRadius: 4, color: Colors.black54)],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    article.flashContent ?? 'Summary not available.',
                    style: GoogleFonts.lato(
                      fontSize: 16,
                      color: Colors.grey[300],
                      height: 1.5,
                    ),
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const Spacer(), // Pushes content to the bottom
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Left: Source
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Source', style: TextStyle(color: Colors.grey[400], fontSize: 12)),
                            Text(
                              article.sourceTitle ?? 'N/A',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      // Middle: Read Button
                      ElevatedButton(
                        onPressed: () => _launchAction(context),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                        ),
                        child: Text(readButtonText, style: const TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      // Right: Share Button
                      Expanded(
                        child: Align(
                          alignment: Alignment.centerRight,
                          child: IconButton(
                            icon: const Icon(Icons.share, color: Colors.white),
                            onPressed: () => _shareArticle(context),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _launchAction(BuildContext context) {
    final bool hasDeepDive = article.articleType == 'Misinformation';
    // For Misinformation, link to the web deep-dive. Otherwise, link to the original source.
    final String urlToLaunch = hasDeepDive
        ? 'https://luminaprojectadmin.netlify.app/#/view/${article.id}'
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
    final String shareUrl = 'https://luminaprojectadmin.netlify.app/#/view/${article.id}';
    final String shareText = '${article.title}\n\nRead more on Lumina:';

    Share.share('$shareText $shareUrl', subject: article.title);
  }
}