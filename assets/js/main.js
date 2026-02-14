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

  // Fake form submit for demo
  const form = document.querySelector('[data-demo-form]');
  if(form){
    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const box = document.querySelector('#formResult');
      if(box){
        box.style.display='block';
        box.textContent = 'Thanks — message received (demo). In a real site, this would send to your email/CRM.';
      }
      form.reset();
    });
  }
})();
