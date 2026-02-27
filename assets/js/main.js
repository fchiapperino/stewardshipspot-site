(function(){
  // Set active nav link based on current path
  const path = (location.pathname || '').toLowerCase();
  document.querySelectorAll('.nav a').forEach(a => {
    const href = (a.getAttribute('href')||'').toLowerCase();
    if(!href) return;
    // normalize: treat /articles/ and /articles/index.html similarly
    const isArticles = path.includes('/articles/') && href.includes('articles');
    const isMatch = (href !== '#' && path.endsWith(href)) || (isArticles && href.includes('articles'));
    if(isMatch) a.setAttribute('aria-current','page');
  });

  // Auto-populate homepage featured articles from a lightweight JSON manifest.
  // This keeps the homepage current without manual edits for every new article.
  async function hydrateFeaturedArticles(){
    const grid = document.getElementById('featuredGrid');
    if(!grid) return;

    try {
      const res = await fetch('/assets/data/articles.json', { cache: 'no-store' });
      if(!res.ok) throw new Error('Failed to load articles.json');
      const items = await res.json();

      const sorted = (Array.isArray(items) ? items : [])
        .filter(x => x && x.title && x.url)
        .sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));

      const top = sorted.slice(0,4);
      grid.innerHTML = top.map(a => {
        const img = a.image ? `<div class="thumb"><img src="${a.image}" alt="Featured image: ${escapeHtml(a.badge||'article')}" loading="lazy"></div>` : '';
        return `
          <article class="card post-card">
            ${img}
            <div class="body">
              ${a.badge ? `<span class=\"badge\">${escapeHtml(a.badge)}</span>` : ''}
              <h3><a href="${a.url}">${escapeHtml(a.title)}</a></h3>
              ${a.excerpt ? `<p>${escapeHtml(a.excerpt)}</p>` : ''}
            </div>
          </article>`;
      }).join('\n');

      if(!top.length){
        grid.innerHTML = `<div class="card"><p class="helper" style="margin:0">Browse all articles <a href="/articles/">here</a>.</p></div>`;
      }
    } catch (e) {
      grid.innerHTML = `<div class="card"><p class="helper" style="margin:0">Browse all articles <a href="/articles/">here</a>.</p></div>`;
    }
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  hydrateFeaturedArticles();

})();
