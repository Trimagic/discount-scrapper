// ──────────────────────────────────────────────────────────────────────────────
// Подключение puppeteer-extra плагинов (однократно на процесс)
// ──────────────────────────────────────────────────────────────────────────────

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import UserPrefsPlugin from "puppeteer-extra-plugin-user-preferences";

export function setupPlugins({ locale = "pl-PL,pl;q=0.9,en;q=0.8" } = {}) {
  if (!puppeteer.__stealth_patched__) {
    puppeteer.use(StealthPlugin());
    puppeteer.__stealth_patched__ = true;
  }
  if (!puppeteer.__prefs_patched__) {
    puppeteer.use(
      UserPrefsPlugin({
        prefs: {
          "intl.accept_languages": locale,
          credentials_enable_service: false,
          "profile.password_manager_enabled": false,
          // WebRTC prefs оставляем «нативно», хардним на уровне JS
          "webrtc.ip_handling_policy": "default_public_interface_only",
          "webrtc.multiple_routes_enabled": true,
          "webrtc.nonproxied_udp_enabled": true,
        },
      })
    );
    puppeteer.__prefs_patched__ = true;
  }
  return puppeteer;
}
