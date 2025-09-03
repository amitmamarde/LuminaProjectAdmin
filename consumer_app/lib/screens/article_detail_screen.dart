import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/article.dart';
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
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 1. Image placeholder (40% of screen height)
          SizedBox(
            height: MediaQuery.of(context).size.height * 0.4,
            child: (article.imageUrl != null && article.imageUrl!.isNotEmpty)
                ? CachedNetworkImage(
                    imageUrl: article.imageUrl!,
                    fit: BoxFit.cover,
                    placeholder: (context, url) =>
                        Container(color: Colors.grey[900]),
                    errorWidget: (context, url, error) => Container(
                      color: Colors.grey[900],
                      child: const Icon(Icons.image_not_supported,
                          color: Colors.grey, size: 50),
                    ),
                  )
                : Container(
                    color: Colors.grey[900],
                    child: const Icon(Icons.image, color: Colors.grey, size: 50),
                  ),
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
                      color: Colors.white,
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
                          color: Colors.grey[400],
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
                                  style: TextStyle(
                                      color: Colors.grey[500], fontSize: 12)),
                              Text(
                                article.sourceTitle ?? 'N/A',
                                style: const TextStyle(
                                    color: Colors.white,
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
                            backgroundColor: Colors.white,
                            foregroundColor: Colors.black,
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
                              icon: const Icon(Icons.share, color: Colors.white),
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
    final String effectiveTitle = article.displayTitle ?? article.title;
    final String shareText = '$effectiveTitle\n\nRead more on Lumina:';

    Share.share('$shareText $shareUrl', subject: effectiveTitle);
  }
}