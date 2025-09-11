import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import os

# Path to your JSON file
JSON_FILE = "/home/amit_pso/LuminaProjectAdmin/functions/source-registry.json"

def get_logo_url(domain):
    """
    Fetches the homepage of the domain and tries to extract a logo/icon URL.
    """
    homepage = f"https://{domain}"
    try:
        response = requests.get(homepage, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Priority order: apple-touch-icon, shortcut icon, icon, og:image
        selectors = [
            ("link", {"rel": lambda x: x and "apple-touch-icon" in x}),
            ("link", {"rel": lambda x: x and "shortcut icon" in x}),
            ("link", {"rel": lambda x: x and "icon" in x}),
            ("meta", {"property": "og:image"})
        ]

        for tag, attrs in selectors:
            found = soup.find(tag, attrs=attrs)
            if found:
                url = found.get("href") or found.get("content")
                if url:
                    return urljoin(homepage, url)

    except Exception as e:
        print(f"[WARN] Could not fetch logo for {domain}: {e}")

    # Fallback: try favicon.ico
    return f"{homepage}/favicon.ico"

def update_json():
    with open(JSON_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    def process_sources(sources):
        for src in sources:
            domain = src.get("domain")
            if not domain:
                continue
            if "logoUrl" not in src:
                logo = get_logo_url(domain)
                src["logoUrl"] = logo
                print(f"[OK] Added logo for {domain}: {logo}")
        return sources

    for category, regions in data["sources"].items():
        for region, obj in regions.items():
            if "allowlist" in obj:
                obj["allowlist"] = process_sources(obj["allowlist"])

    # Backup old JSON
    backup_file = JSON_FILE + ".bak"
    os.rename(JSON_FILE, backup_file)

    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Updated JSON saved to {JSON_FILE} (backup at {backup_file})")

if __name__ == "__main__":
    update_json()

