import fs from "node:fs";
import path from "node:path";
import { expect, test } from "bun:test";
import { FILES, PROJECT, ROOT, validateRelease } from "../scripts/distribution.ts";

function manifest() {
  return { schema_version: 1, repository: PROJECT.repository, version: "0.5.0", tag: "v0.5.0", platforms: Object.fromEntries(Object.entries(FILES).map(([target, filename]) =>
    [target, { filename, bytes: 123456789, sha256: "a".repeat(64), url: `${PROJECT.repository_url}/releases/download/v0.5.0/${filename}` }])) };
}
test("release manifest pins both platforms to the same repository and version", () => {
  expect(validateRelease(manifest()).tag).toBe("v0.5.0");
});
test("release validation rejects foreign, mutable or escaping artifact URLs", () => {
  for (const value of ["https://evil.invalid/a.exe", `${PROJECT.repository_url}/releases/latest/download/session-bridge-windows-x64.exe`,
    "https://github.com/another/repo/releases/download/v0.5.0/session-bridge-windows-x64.exe"]) {
    const m = manifest(); m.platforms["windows-x64"].url = value; expect(() => validateRelease(m)).toThrow();
  }
});
test("release validation rejects malformed names, hashes, byte limits and version mismatches", () => {
  for (const [key, value] of [["filename", "../anything.exe"], ["sha256", "invalid"], ["bytes", 170000000], ["bytes", -1]]) {
    const m = manifest(); (m.platforms["windows-x64"] as any)[key] = value; expect(() => validateRelease(m)).toThrow();
  }
  const m = manifest(); m.tag = "v0.4.0"; expect(() => validateRelease(m)).toThrow();
});
test("README defaults to English with a Chinese switch link and bidirectional navigation", () => {
  const en = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const zh = fs.readFileSync(path.join(ROOT, "README.zh-CN.md"), "utf8");
  expect(en).toContain("[简体中文](README.zh-CN.md)");
  expect(en).toContain("## For an Agent Receiving This GitHub URL");
  expect(zh).toContain("[English](README.md)");
  expect(zh).toContain("## 给收到这个 GitHub 地址的 agent");
});
test("Pages homepage includes complete EN/ZH translations and defaults non-en/zh device languages to English", () => {
  const html = fs.readFileSync(path.join(ROOT, "site/index.html"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "site/app.js"), "utf8");
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('data-lang="en"');
  expect(html).toContain('data-lang="zh"');
  expect(html).toContain('data-star');
  expect(html).toContain('data-star-count');
  expect(html).toContain('data-motion-toggle');
  expect(html).toContain('https://github.com/lyzMaster/session-bridge');
  expect(app).toContain("Default non-English / non-Chinese primary device languages to English");

  const dictMatch = app.match(/const I18N = (\{[\s\S]*?\n  \});/);
  expect(dictMatch).toBeTruthy();
  const I18N = new Function(`return (${dictMatch![1]});`)();
  expect(Object.keys(I18N)).toEqual(["en", "zh"]);

  for (const [attr, bucket] of [["data-i18n", "text"], ["data-i18n-html", "html"], ["data-i18n-aria", "aria"]] as const) {
    for (const match of html.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))) {
      const key = match[1];
      expect(typeof I18N.en[bucket][key]).toBe("string");
      expect(typeof I18N.zh[bucket][key]).toBe("string");
    }
  }

  // Exercise the actual normalizeLang / detectLanguage functions from site/app.js across locales.
  const detectBody = app.match(/function normalizeLang[\s\S]*?function detectLanguage\(\)[\s\S]*?\n  \}/)?.[0];
  expect(detectBody).toBeTruthy();
  const resolveLocale = (languages: string[], search = "", saved: string | null = null) => {
    const fn = new Function("window", "navigator", "localStorage", "STORAGE_KEY",
      `${detectBody}\nreturn detectLanguage();`);
    return fn({ location: { search } }, { languages, language: languages[0] || "" },
      { getItem: () => saved }, "session-bridge-lang");
  };
  expect(resolveLocale(["zh-CN", "en-US"])).toBe("zh");
  expect(resolveLocale(["zh_TW"])).toBe("zh");
  expect(resolveLocale(["en-US"])).toBe("en");
  expect(resolveLocale(["fr-FR", "zh-CN"])).toBe("en");
  expect(resolveLocale(["ja"])).toBe("en");
  expect(resolveLocale([])).toBe("en");
  expect(resolveLocale(["fr-FR"], "?lang=zh")).toBe("zh");
  expect(resolveLocale(["zh-CN"], "", "en")).toBe("en");
});
