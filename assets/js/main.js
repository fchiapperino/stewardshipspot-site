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

})();
