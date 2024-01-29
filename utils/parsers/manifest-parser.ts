class ManifestParser {
  private constructor() {}

  static convertManifestToString(
    manifest: chrome.runtime.ManifestV3 | browser._manifest.WebExtensionManifest
  ): string {
    return JSON.stringify(manifest, null, 2);
  }
}

export default ManifestParser;
