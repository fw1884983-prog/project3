import { fetchWithTimeout } from "../utils/fetchWithTimeout.js";

const WIKI_ZH = "https://zh.wikipedia.org/w/api.php";
const WIKI_EN = "https://en.wikipedia.org/w/api.php";
const WIKI_COMMONS = "https://commons.wikimedia.org/w/api.php";
const DDG = "https://api.duckduckgo.com/";

function wikiUrl(base, params) {
  const q = new URLSearchParams({ format: "json", origin: "*", ...params });
  return `${base}?${q}`;
}

async function wikiJson(base, params, timeoutMs = 12000) {
  const res = await fetchWithTimeout(wikiUrl(base, params), {}, timeoutMs);
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  return res.json();
}

/**
 * 按名称与坐标从中文/英文维基拉取摘要与配图。
 */
export async function fetchPublicWebArchive({ name, lat, lon }) {
  const snippets = [];
  const images = [];
  const sources = [];

  const titleCandidates = await resolveWikiTitles(name, lat, lon);
  for (const { title, lang, pageid } of titleCandidates.slice(0, 2)) {
    const base = lang === "en" ? WIKI_EN : WIKI_ZH;
    try {
      const detail = await wikiPageDetail(base, title);
      if (detail.extract) {
        snippets.push({
          source: `Wikipedia (${lang})`,
          title: detail.title,
          url: detail.url,
          text: detail.extract.slice(0, 3500),
        });
        sources.push({ title: detail.title, url: detail.url, type: "wikipedia" });
      }
      for (const img of detail.images) {
        if (!images.some((x) => x.url === img.url)) images.push(img);
      }
    } catch {
      /* try next */
    }
    if (pageid && images.length < 6) {
      try {
        const extra = await wikiCommonsCategoryImages(title);
        for (const img of extra) {
          if (images.length >= 8) break;
          if (!images.some((x) => x.url === img.url)) images.push(img);
        }
      } catch {
        /* optional */
      }
    }
  }

  try {
    const ddg = await fetchDuckDuckGoSnippet(name);
    if (ddg?.text) {
      snippets.push({
        source: "DuckDuckGo",
        title: ddg.title || name,
        url: ddg.url,
        text: ddg.text.slice(0, 2000),
      });
      if (ddg.url) sources.push({ title: ddg.title || name, url: ddg.url, type: "web" });
      if (ddg.image && !images.some((i) => i.url === ddg.image)) {
        images.unshift({
          url: ddg.image,
          caption: ddg.title || name,
          credit: "DuckDuckGo",
        });
      }
    }
  } catch {
    /* optional */
  }

  return { snippets, images: images.slice(0, 10), sources };
}

async function resolveWikiTitles(name, lat, lon) {
  const out = [];
  const seen = new Set();

  const push = (title, lang, pageid) => {
    const k = `${lang}:${title}`;
    if (!title || seen.has(k)) return;
    seen.add(k);
    out.push({ title, lang, pageid });
  };

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    for (const lang of ["zh", "en"]) {
      const base = lang === "en" ? WIKI_EN : WIKI_ZH;
      try {
        const data = await wikiJson(base, {
          action: "query",
          list: "geosearch",
          gscoord: `${lat}|${lon}`,
          gsradius: 400,
          gslimit: 6,
        });
        const items = data?.query?.geosearch || [];
        for (const it of items) {
          if (name && !titleMatches(name, it.title)) continue;
          push(it.title, lang, it.pageid);
        }
        if (items.length) {
          push(items[0].title, lang, items[0].pageid);
        }
      } catch {
        /* continue */
      }
    }
  }

  if (name) {
    for (const lang of ["zh", "en"]) {
      const base = lang === "en" ? WIKI_EN : WIKI_ZH;
      try {
        const data = await wikiJson(base, {
          action: "opensearch",
          search: name,
          limit: 4,
          namespace: 0,
        });
        const titles = data?.[1] || [];
        const urls = data?.[3] || [];
        titles.forEach((t, i) => push(t, lang, null));
        if (urls[0] && titles[0]) {
          /* already pushed */
        }
      } catch {
        /* continue */
      }
    }
  }

  return out;
}

function titleMatches(query, title) {
  const q = String(query).trim().toLowerCase();
  const t = String(title).trim().toLowerCase();
  if (!q || !t) return true;
  return t.includes(q) || q.includes(t) || levenshteinClose(q, t);
}

function levenshteinClose(a, b) {
  if (a.length < 2 || b.length < 2) return false;
  return a.slice(0, 4) === b.slice(0, 4) || b.includes(a.slice(0, Math.min(4, a.length)));
}

async function wikiPageDetail(base, title) {
  const data = await wikiJson(base, {
    action: "query",
    prop: "extracts|pageimages|info|images",
    titles: title,
    exintro: "1",
    explaintext: "1",
    piprop: "thumbnail|original",
    pithumbsize: 640,
    imlimit: 12,
    inprop: "url",
  });
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) {
    throw new Error("维基页面不存在");
  }

  const images = [];
  if (page.thumbnail?.source) {
    images.push({
      url: page.thumbnail.source,
      caption: page.title,
      credit: "Wikipedia",
    });
  }
  if (page.original?.source && page.original.source !== page.thumbnail?.source) {
    images.push({
      url: page.original.source,
      caption: page.title,
      credit: "Wikipedia",
    });
  }

  const fileNames = (page.images || [])
    .map((im) => im.title)
    .filter((t) => t && /\.(jpg|jpeg|png|webp)$/i.test(t))
    .slice(0, 6);

  if (fileNames.length) {
    const infos = await wikiImageInfo(base, fileNames);
    for (const info of infos) {
      if (info.url) {
        images.push({
          url: info.url,
          caption: info.caption || page.title,
          credit: "Wikimedia",
        });
      }
    }
  }

  return {
    title: page.title,
    url: page.fullurl || page.canonicalurl || "",
    extract: page.extract || "",
    images,
  };
}

async function wikiImageInfo(base, fileTitles) {
  const data = await wikiJson(base, {
    action: "query",
    titles: fileTitles.join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: 640,
  });
  const pages = data?.query?.pages || {};
  return Object.values(pages).map((p) => {
    const ii = p.imageinfo?.[0];
    const caption =
      ii?.extmetadata?.ImageDescription?.value?.replace(/<[^>]+>/g, "").slice(0, 120) ||
      p.title?.replace(/^File:/, "") ||
      "";
    return { url: ii?.thumburl || ii?.url, caption };
  });
}

async function wikiCommonsCategoryImages(pageTitle) {
  const data = await wikiJson(WIKI_COMMONS, {
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${pageTitle}`,
    gsrlimit: 4,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: 480,
  });
  const pages = data?.query?.pages || {};
  return Object.values(pages)
    .map((p) => ({
      url: p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url,
      caption: p.title?.replace(/^File:/, "") || "",
      credit: "Wikimedia Commons",
    }))
    .filter((x) => x.url);
}

async function fetchDuckDuckGoSnippet(query) {
  const url = `${DDG}?${new URLSearchParams({
    q: query,
    format: "json",
    no_html: "1",
    skip_disambig: "1",
  })}`;
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 8000);
  if (!res.ok) throw new Error("DDG unavailable");
  const data = await res.json();
  const text = [data.AbstractText, data.Definition].filter(Boolean).join("\n");
  if (!text?.trim()) return null;
  return {
    title: data.Heading || query,
    url: data.AbstractURL || "",
    text,
    image: data.Image && data.Image.startsWith("http") ? data.Image : null,
  };
}
