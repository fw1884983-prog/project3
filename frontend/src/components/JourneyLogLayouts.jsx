/**
 * 三套旅行日志排版（源自 Urban Travel Journal Layouts / Figma）
 * A — Minimal Editorial · B — Scrapbook · C — Cinematic
 */
import "./JourneyLogLayouts.css";

function normalizeJournal(log) {
  const hero = log?.hero;
  const heroUrl = typeof hero === "string" ? hero : hero?.url || "";
  return {
    title: log?.title || "旅行日志",
    subtitle: log?.subtitle || "",
    coordinates: log?.coordinates || "",
    summary: log?.summary || log?.full_story || "",
    highlights: Array.isArray(log?.highlights) ? log.highlights : [],
    hero: heroUrl,
    heroAlt: log?.heroAlt || (typeof hero === "object" ? hero?.alt : "") || log?.title,
    supporting: (log?.supporting || []).map((s) => ({
      url: s.url,
      alt: s.alt || s.caption,
      caption: s.caption || "",
    })),
  };
}

export function JourneyLogLayout({ log }) {
  const variant = log?.layout_variant || "A";
  const J = normalizeJournal(log);

  if (variant === "B") return <VariantB J={J} />;
  if (variant === "C") return <VariantC J={J} />;
  return <VariantA J={J} />;
}

function VariantA({ J }) {
  return (
    <article className="jl jl-a">
      <div className="jl-a-top">
        <span className="jl-mono jl-muted">{J.subtitle}</span>
        <span className="jl-mono jl-accent-tag">AI × Editorial</span>
      </div>
      <div className="jl-rule" />
      <h1 className="jl-a-title">{J.title}</h1>
      {J.coordinates ? <p className="jl-mono jl-coords">{J.coordinates}</p> : null}
      {J.hero ? (
        <figure className="jl-a-hero">
          <img src={J.hero} alt={J.heroAlt} />
          {J.supporting[0]?.caption ? (
            <figcaption className="jl-mono">{J.supporting[0].caption}</figcaption>
          ) : null}
        </figure>
      ) : null}
      <div className="jl-rule jl-rule-spaced" />
      <p className="jl-a-summary">{J.summary}</p>
      {J.highlights.length > 0 ? (
        <div className="jl-a-notes">
          <p className="jl-mono jl-field-label">Field Notes</p>
          <ul>
            {J.highlights.map((h, i) => (
              <li key={i}>
                <span className="jl-dash">—</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {J.supporting.length > 0 ? (
        <>
          <div className="jl-rule" />
          <div className="jl-a-grid">
            {J.supporting.slice(0, 2).map((img, i) => (
              <figure key={i}>
                <img src={img.url} alt={img.alt} />
                {img.caption ? <figcaption className="jl-mono">{img.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        </>
      ) : null}
    </article>
  );
}

const SCRAP_EMOJI = ["✨", "🍢", "🎷", "🍜"];

function VariantB({ J }) {
  return (
    <article className="jl jl-b">
      <div className="jl-b-sticker">AI ✦ Journey</div>
      {J.subtitle ? (
        <div className="jl-b-pill">
          <span>📍</span>
          <span>{J.subtitle}</span>
        </div>
      ) : null}
      {J.hero ? (
        <figure className="jl-b-polaroid jl-b-polaroid-main">
          <div className="jl-b-tape jl-b-tape-l" />
          <div className="jl-b-tape jl-b-tape-r" />
          <div className="jl-b-photo-wrap">
            <img src={J.hero} alt={J.heroAlt} />
          </div>
          <figcaption className="jl-caveat">{J.supporting[0]?.caption || J.title}</figcaption>
        </figure>
      ) : null}
      <h1 className="jl-b-title">
        <span className="jl-b-highlight">{J.title}</span>
      </h1>
      <p className="jl-caveat jl-b-tagline">— 沿路线的城市叙事手记 ✦</p>
      <p className="jl-b-summary">{J.summary}</p>
      <div className="jl-b-highlights">
        {J.highlights.map((h, i) => (
          <div key={i} className="jl-b-hl-row">
            <span>{SCRAP_EMOJI[i % SCRAP_EMOJI.length]}</span>
            <p>{h}</p>
          </div>
        ))}
      </div>
      {J.supporting.length > 0 ? (
        <div className="jl-b-grid">
          {J.supporting.slice(0, 2).map((img, i) => (
            <figure key={i} className={i === 1 ? "jl-b-tilt-r" : "jl-b-tilt-l"}>
              <div className="jl-b-photo-wrap sm">
                <img src={img.url} alt={img.alt} />
              </div>
              {img.caption ? <figcaption className="jl-caveat">{img.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
      {J.coordinates ? <p className="jl-caveat jl-b-coords">{J.coordinates} 🗺️</p> : null}
    </article>
  );
}

function VariantC({ J }) {
  return (
    <article className="jl jl-c">
      <div className="jl-c-hero">
        {J.hero ? <img src={J.hero} alt={J.heroAlt} /> : <div className="jl-c-hero-fallback" />}
        <div className="jl-c-hero-grad" />
        <div className="jl-c-hero-top">
          <span className="jl-mono">Urban Dispatch</span>
          <span className="jl-mono jl-accent-dot">AI Curated</span>
        </div>
        <div className="jl-c-hero-title">
          <span className="jl-mono jl-c-loc">{J.subtitle || "城市叙事"}</span>
          <h1>{J.title}</h1>
        </div>
      </div>
      <div className="jl-c-body">
        <div className="jl-c-main">
          <p className="jl-c-summary">{J.summary}</p>
          {J.highlights.length > 0 ? (
            <>
              <p className="jl-mono jl-field-label">Field Notes</p>
              <ul className="jl-c-notes">
                {J.highlights.map((h, i) => (
                  <li key={i}>
                    <span className="jl-mono">0{i + 1}</span>
                    {h}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {J.coordinates ? <p className="jl-mono jl-c-coords">{J.coordinates}</p> : null}
        </div>
        <div className="jl-c-side">
          {J.supporting.slice(0, 2).map((img, i) => (
            <figure key={i}>
              <img src={img.url} alt={img.alt} />
              <figcaption className="jl-mono">{img.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="jl-c-foot">
        <span className="jl-mono">{J.subtitle}</span>
        <span className="jl-mono">AI × Editorial</span>
      </div>
    </article>
  );
}
