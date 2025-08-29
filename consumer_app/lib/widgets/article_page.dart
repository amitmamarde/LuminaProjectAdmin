import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:consumer_app/models/article_model.dart';
import 'package:consumer_app/screens/article_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

class ArticlePage extends StatelessWidget {
  final Article article;

  const ArticlePage({super.key, required this.article});

  Future<void> _launchSourceUrl() async {
    if (article.sourceUrl != null) {
      final uri = Uri.parse(article.sourceUrl!);
      // For web, this opens a new tab, which is the desired behavior.
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        // You could show a snackbar here if launching fails
        debugPrint('Could not launch ${uri.toString()}');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // This logic mirrors the React app's behavior for the action button.
    final bool hasDeepDive =
        article.articleType == 'Misinformation' &&
        (article.deepDiveContent?.isNotEmpty ?? false);
    final bool canTakeAction =
        hasDeepDive || (article.sourceUrl?.isNotEmpty ?? false);

    String buttonText;
    VoidCallback? onPressedAction;

    if (hasDeepDive) {
      buttonText = 'Read Full Story';
      onPressedAction = () {
        // For web, this will change the URL in the address bar.
        // A more robust solution for web would use a routing package.
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => ArticleDetailScreen(article: article),
          ),
        );
      };
    } else {
      buttonText = 'Read at ${article.sourceTitle ?? 'Source'}';
      onPressedAction = _launchSourceUrl;
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Background Image
          if (article.imageUrl != null)
            CachedNetworkImage(
              imageUrl: article.imageUrl!,
              fit: BoxFit.cover,
              placeholder: (context, url) => Container(color: Colors.black),
              errorWidget: (context, url, error) =>
                  Container(color: Colors.black),
            ),

          // Backdrop blur and overlay
          Positioned.fill(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 5.0, sigmaY: 5.0),
              child: Container(color: Colors.black.withOpacity(0.6)),
            ),
          ),

          // Content
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const Spacer(flex: 2),
                  Text(
                    article.title,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.lato(
                      fontSize: 36,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      shadows: [
                        const Shadow(
                          blurRadius: 8.0,
                          color: Colors.black54,
                          offset: Offset(2.0, 2.0),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    article.flashContent ?? '',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.lato(
                      fontSize: 18,
                      color: Colors.white.withOpacity(0.9),
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (article.sourceTitle != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.3),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'Source: ${article.sourceTitle}',
                        style: GoogleFonts.lato(
                          fontSize: 14,
                          color: Colors.white70,
                        ),
                      ),
                    ),
                  const Spacer(flex: 3),
                  if (canTakeAction)
                    ElevatedButton(
                      onPressed: onPressedAction,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 32,
                          vertical: 16,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                        textStyle: GoogleFonts.lato(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      child: Text(buttonText),
                    ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
