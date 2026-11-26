(async () => {
  'use strict';

  const D = window.PrestesData;
  const root = document.body.dataset.root;
  const page = document.body.dataset.page;
  const main = document.querySelector('main');
  const params = new URLSearchParams(location.search);
  const localDraft = D.preview() && location.protocol !== 'file:' ? await D.load('preview').catch(() => null) : null;
  const catalog = localDraft || window.PRESTES_CATALOGO;
  const cars = catalog.cars;
  const byLap = D.ordered(cars);
  const byEpisode = D.latest(cars);
  const current = cars.find(car => car.id === params.get('id'));
  const nav = { inicio: ['', 'Início'], ranking: ['ranking/', 'Ranking'], garagem: ['garagem/', 'Garagem'],
    recordes: ['recordes/', 'Recordes'], gerenciar: ['gerenciar/', 'Gerenciar'],
    adicionar: ['gerenciar/adicionar/'], editar: ['gerenciar/editar/'], carro: ['garagem/carro/'],
    pista: ['pista/'], comparar: ['garagem/comparar/'], rascunhos: ['gerenciar/rascunhos/'],
    lotes: ['gerenciar/lotes/'], previa: ['gerenciar/previa/'] };
  const titles = {
    tempo: ['Volta mais rápida', car => D.lap(car.tempo)],
    velocidade: ['Maior velocidade na pista', car => D.decimal.format(car.velocidade) + ' km/h'],
    potencia: ['Maior potência', car => unit(car.potencia, 'cv')],
    valor: ['Carro mais valioso', car => priceText(car.valor)]
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const url = (target, id) => root + nav[target][0] + 'index.html' + (id ? '?id=' + encodeURIComponent(id) : '');
  const link = (target, title, className = 'button', id) =>
    '<a class="' + className + '" href="' + url(target, id) + '">' + escapeHtml(title) + '</a>';
  const photo = (car, lazy = true) => !car.foto ?
    '<div class="car-photo photo-empty">Foto do showroom pendente</div>' : '<img class="car-photo" src="' + escapeHtml(car.foto.startsWith('data:image/webp;base64,') ? car.foto : root + car.foto) +
    '" alt="' + escapeHtml(D.name(car) + ' no showroom') + '"' + (lazy ? ' loading="lazy"' : '') + '>';
  const unit = (value, symbol) => Number.isFinite(value) ? D.decimal.format(value) + ' ' + symbol : '—';
  const gap = milliseconds => '+' + (milliseconds / 1000).toFixed(3) + ' s';
  const hasPrice = value => Number.isFinite(value) && value > 0;
  const priceText = value => hasPrice(value) ? D.currency.format(value) : 'Sem valor estimado';
  const adminPages = ['gerenciar', 'adicionar', 'editar', 'rascunhos', 'lotes', 'previa'];
  const base = ['carro', 'comparar'].includes(page) ? 'garagem' : adminPages.includes(page) ? 'gerenciar' : page;
  const brand = '<span class="monogram" aria-hidden="true">P</span><span class="wordmark">PRESTES<small>RACING</small></span>';
  const section = (title, body, action = '') => '<section class="section wrap"><div class="section-head"><h2>' +
    title + '</h2>' + action + '</div>' + body + '</section>';
  const intro = (title, description = '') => '<div class="page-intro"><h1>' + title + '</h1>' +
    (description ? '<p>' + description + '</p>' : '') + '</div>';
  const empty = message => '<div class="empty"><p>' + message + '</p></div>';

  document.querySelector('#cabecalho').innerHTML = '<div class="header-inner wrap"><a class="brand" href="' +
    url('inicio') + '" aria-label="Prestes Racing, início">' + brand + '</a><nav aria-label="Menu principal">' +
    Object.entries(nav).filter(([, item]) => item[1]).map(([key, [, label]]) =>
      '<a href="' + url(key) + '"' + (key === base ? ' aria-current="page"' : '') + '>' + label + '</a>'
    ).join('') + '</nav></div>';
  document.querySelector('#rodape').innerHTML = '<div class="wrap footer-inner"><a class="brand" href="' +
    url('inicio') + '" aria-label="Prestes Racing, início">' + brand +
    '</a><span><i class="brasil" aria-hidden="true"></i> Temporada 2026 · Magione, Itália</span></div>';

  function rankingTable(rows, pool = rows, order = 'tempo', showGap = false) {
    const column = { potencia: ['Potência', 'cv'], velocidade: ['Velocidade na pista', 'km/h'], peso: ['Peso', 'kg'] }[order];
    const positions = new Map(pool.map((car, index) => [car.id, index + 1]));
    const leader = showGap ? Math.min(...pool.map(car => car.tempo)) : 0;
    const content = rows.map(car => {
      const pos = order === 'tempo' ? D.position(pool, car) : positions.get(car.id);
      const medal = order === 'tempo' && pos <= 3 ? ' podium-' + pos : '';
      return '<tr><td class="rank-number' + medal + '">' + pos + 'º</td><th scope="row">' +
        link('carro', D.name(car), 'car-link', car.id) + '</th><td>' + D.categories[car.categoria] +
        '</td><td class="lap">' + D.lap(car.tempo) + '</td>' +
        (showGap ? '<td class="lap gap">' + (car.tempo === leader ? '—' : gap(car.tempo - leader)) + '</td>' : '') +
        (column ? '<td class="lap">' + unit(car[order], column[1]) + '</td>' : '') + '</tr>';
    }).join('');
    return '<div class="table-frame"><table><thead><tr><th scope="col">Pos.</th><th scope="col">Carro</th>' +
      '<th scope="col">Categoria</th><th scope="col">Melhor volta</th>' +
      (showGap ? '<th scope="col">Gap pro líder</th>' : '') +
      (column ? '<th scope="col">' + column[0] + '</th>' : '') +
      '</tr></thead><tbody>' + (content || '<tr><td class="table-empty" colspan="' +
      (4 + Number(Boolean(column)) + Number(showGap)) + '">Nenhum carro encontrado nesta classificação.</td></tr>') +
      '</tbody></table></div>';
  }

  function podium(items) {
    if (!items.length) return '';
    return '<div class="podium" aria-label="Pódio do Ranking Geral">' +
      items.map((car, index) => '<a class="podium-card place-' + (index + 1) + '" href="' + url('carro', car.id) + '">' +
        photo(car) + '<div class="card-copy"><span class="podium-' + (index + 1) + '">' + (index + 1) +
        'º lugar</span><h3>' + escapeHtml(D.name(car)) + '</h3><strong class="lap">' + D.lap(car.tempo) +
        '</strong></div></a>').join('') + '</div>';
  }

  function cards(items, showPrice, chosen) {
    if (!items.length) return empty('Nenhum carro encontrado.');
    return '<div class="car-grid' + (showPrice ? ' garage-grid' : '') + '">' +
      items.map(car => '<article class="car-card"><a href="' + url('carro', car.id) + '">' + photo(car) +
        '<div class="card-copy"><h3>' + escapeHtml(D.name(car)) + '</h3><span class="lap">' + D.lap(car.tempo) +
        '</span>' + (showPrice ? '<span class="price">' + priceText(car.valor) + '</span>' : '') +
        '</div></a>' + (chosen ? '<button class="secondary compare-pick" type="button" data-compare="' +
          escapeHtml(car.id) + '" aria-pressed="' + chosen.has(car.id) + '" aria-label="Comparar ' +
          escapeHtml(D.name(car)) + '">' + (chosen.has(car.id) ? 'Selecionado' : 'Selecionar pra comparar') +
          '</button>' : '') + '</article>').join('') + '</div>';
  }

  function recordCards(withPhoto) {
    return '<div class="record-grid record-grid-v2">' + Object.entries(titles).map(([order, [title, format]]) => {
      const leaders = D.holders(cars, order);
      const photos = withPhoto && leaders.length ? '<div class="record-photos">' +
        leaders.map(car => '<a href="' + url('carro', car.id) + '" aria-label="' + escapeHtml(D.name(car)) + '">' +
          photo(car) + '</a>').join('') + '</div>' : '';
      const priceCard = order === 'valor';
      let value = leaders.length ? escapeHtml(format(leaders[0])) : '—';
      if (priceCard && leaders.length) {
        const parts = D.currency.formatToParts(leaders[0].valor);
        const currency = parts.find(part => part.type === 'currency')?.value || 'US$';
        const amount = parts.filter(part => part.type !== 'currency').map(part => part.value).join('').trim();
        value = '<span class="record-currency">' + escapeHtml(currency) + '</span> ' +
          '<span class="record-amount">' + escapeHtml(amount) + '</span>';
      }
      return '<article class="record-card' + (priceCard ? ' record-card-price' : '') + '">' +
        photos + '<div class="card-copy"><h3>' + title + '</h3>' +
        '<strong class="record-value">' + value + '</strong>' +
        '<div class="record-holders">' + (leaders.map(car => link('carro', D.name(car), 'car-link', car.id)).join('') ||
        'Aguardando o primeiro resultado') + '</div></div></article>';
    }).join('') + '</div>';
  }

  function track() {
    return '<section class="track-section"><div class="wrap track-story"><h2>História do circuito</h2><p>Inaugurado em 1973 na Úmbria, na Itália, o Autódromo de Magione nasceu por iniciativa da Scuderia Carpine. ' +
      'O traçado original tinha 1.650 metros e logo se destacou pela pilotagem técnica. Em 1996, a pista foi ampliada para 2.507 metros, ' +
      'com novos boxes e um paddock maior.</p>' +
      '<p>Na história do Prestes Racing, Carlos Prestes comprou o autódromo em 2026 e o rebatizou de <strong>Prestes Motorsport Park</strong>. ' +
      'A reforma modernizou o circuito de ponta a ponta, com asfalto novo, áreas de escape ampliadas, novas arquibancadas e um complexo de boxes e paddock renovado. ' +
      'O autódromo virou a casa das voltas rápidas do canal e ganhou estrutura para receber provas de <strong>GT3, Fórmula 4 e outras categorias de turismo e monopostos</strong>.</p>' +
      '<dl class="track-stats"><div><dt>Extensão</dt><dd>2.507 m</dd></div><div><dt>Curvas</dt><dd>11</dd></div>' +
      '<div><dt>Local</dt><dd>Magione, Itália</dd></div></dl></div></section>' +
      section('Mapa do traçado', '<figure class="track-map"><a href="' + root + 'assets/tracado-magione.png">' +
        '<img src="' + root + 'assets/tracado-magione.png" alt="Abrir mapa do circuito com as 11 curvas numeradas"></a>' +
        '<figcaption>Traçado adaptado de <a href="https://commons.wikimedia.org/wiki/File:Autodromo_di_Magione_Track_Layout.svg">Blanders506</a> · ' +
        '<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></figcaption></figure>');
  }

  function home() {
    const pictures = window.FOTOS_DA_PISTA;
    const last = byEpisode[0];
    main.innerHTML = '<section class="hero" aria-label="Fotos da pista">' +
      pictures.map(({ arquivo, descricao }, index) => '<img class="hero-image' + (index === 0 ? ' visible' : '') +
        '" src="' + escapeHtml(root + 'assets/' + arquivo) + '" alt="' + escapeHtml(descricao) + '"' +
        (index === 0 ? ' fetchpriority="high"' : ' aria-hidden="true"') + '>').join('') +
      '<div class="hero-caption"><div class="wrap caption-inner"><h1>Prestes Motorsport Park</h1>' +
      (pictures.length > 1 ? '<div class="slide-controls"><button type="button" id="slide-prev" aria-label="Foto anterior">‹</button>' +
        '<button type="button" id="slide-pause" aria-label="Pausar carrossel">Ⅱ</button>' +
        '<button type="button" id="slide-next" aria-label="Próxima foto">›</button></div>' : '') +
      '</div></div></section>' +
      section('Ranking Geral', rankingTable(byLap.slice(0, 10), byLap), link('ranking', 'Ver ranking completo')) +
      section('Garagem', byEpisode.length ? cards(byEpisode.slice(0, 5), false) : empty('A garagem está pronta para receber os primeiros carros.'),
        link('garagem', 'Ver garagem completa')) +
      section('Recordes', recordCards(false), link('recordes', 'Ver todos os recordes')) +
      section('Última Volta Rápida', last ? '<article class="featured">' + photo(last) + '<div class="card-copy"><span>Volta Rápida nº ' +
        String(last.episodio).padStart(2, '0') + '</span><h3>' + escapeHtml(D.name(last)) + '</h3>' +
        '<strong class="lap">' + D.lap(last.tempo) + '</strong>' + link('carro', 'Ver ficha do carro', 'button', last.id) + '</div></article>' : empty('A primeira Volta Rápida aparece aqui assim que for publicada.')) +
      section('Conheça a pista', '<a class="track-teaser" href="' + url('pista') + '">' +
        '<img loading="lazy" src="' + root + 'assets/pista-aerea.webp" alt="Vista aérea do circuito">' +
        '<span>Magione, Itália · 2.507 m · 11 curvas</span></a>', link('pista', 'Conheça a pista'));

    if (pictures.length > 1) carousel();
  }

  function carousel() {
    const nodes = [...main.querySelectorAll('.hero-image')];
    const pause = main.querySelector('#slide-pause');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let active = 0;
    let paused = motion.matches;
    let timer;
    function advance(step) {
      nodes[active].classList.remove('visible');
      nodes[active].setAttribute('aria-hidden', 'true');
      active = (nodes.length + active + step) % nodes.length;
      nodes[active].classList.add('visible');
      nodes[active].removeAttribute('aria-hidden');
    }
    function restart() {
      clearInterval(timer);
      pause.textContent = paused ? '▶' : 'Ⅱ';
      pause.setAttribute('aria-label', paused ? 'Iniciar carrossel' : 'Pausar carrossel');
      if (!paused && !document.hidden) timer = setInterval(() => advance(1), 6500);
    }
    main.querySelector('#slide-prev').onclick = () => { advance(-1); restart(); };
    main.querySelector('#slide-next').onclick = () => { advance(1); restart(); };
    pause.onclick = () => { paused = !paused; restart(); };
    document.addEventListener('visibilitychange', restart);
    restart();
  }

  function paginate(total, size, pageNumber, result, render) {
    const last = Math.max(1, Math.ceil(total / size));
    if (last === 1) return;
    result.insertAdjacentHTML('beforeend', '<nav class="pagination" aria-label="Paginação">' +
      '<button type="button" data-step="-1"' + (pageNumber === 1 ? ' disabled' : '') + '>Anterior</button>' +
      '<span>Página ' + pageNumber + ' de ' + last + '</span><button type="button" data-step="1"' +
      (pageNumber === last ? ' disabled' : '') + '>Próxima</button></nav>');
    result.querySelectorAll('button[data-step]').forEach(button => button.onclick = () => {
      render(pageNumber + Number(button.dataset.step));
      result.focus({ preventScroll: true });
      result.scrollIntoView({ block: 'start' });
    });
  }

  function ranking() {
    const counts = Object.create(null);
    for (const car of cars) counts[car.categoria] = (counts[car.categoria] || 0) + 1;
    main.innerHTML = '<section class="wrap content">' + intro('Ranking', 'Classificação das voltas do Prestes Racing em Magione.') +
      '<div class="ranking-controls"><div class="chips" aria-label="Categoria">' +
      Object.entries({ geral: 'Geral', ...D.categories }).map(([id, name]) =>
        '<button type="button" data-category="' + id + '" aria-pressed="' + (id === 'geral') + '">' + name +
        ' <span>(' + (id === 'geral' ? cars.length : counts[id] || 0) + ')</span></button>'
      ).join('') + '</div><div class="ranking-fields"><label>Buscar carro<input id="search" type="search" placeholder="Marca ou modelo"></label>' +
      '<label>Ordenar por<select id="order">' + Object.entries(D.orders).map(([id, [name]]) =>
        '<option value="' + id + '">' + name + '</option>').join('') +
      '</select></label></div></div><div id="podium"></div><div id="result" tabindex="-1" aria-live="polite"></div></section>';
    const result = main.querySelector('#result');
    const order = main.querySelector('#order');
    const search = main.querySelector('#search');
    let category = 'geral';
    function render(pageNumber = 1) {
      const list = D.ordered(category === 'geral' ? cars : cars.filter(car => car.categoria === category), order.value);
      const query = D.normalize(search.value.trim());
      const matches = list.filter(car => D.normalize(D.name(car)).includes(query));
      main.querySelector('#podium').innerHTML = category === 'geral' && order.value === 'tempo' && !query && pageNumber === 1 ?
        podium(byLap.slice(0, 3)) : '';
      const offset = (pageNumber - 1) * 25;
      result.innerHTML = rankingTable(matches.slice(offset, offset + 25), list, order.value, true);
      paginate(matches.length, 25, pageNumber, result, render);
    }
    main.querySelectorAll('[data-category]').forEach(button => button.onclick = () => {
      main.querySelector('[aria-pressed="true"]').setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      category = button.dataset.category;
      render();
    });
    order.onchange = search.oninput = () => render();
    render();
  }

  function garage() {
    const prices = cars.filter(car => hasPrice(car.valor)).map(car => car.valor);
    const floor = prices.length ? Math.min(...prices) : 0;
    const ceiling = prices.length ? Math.max(...prices) : 0;
    const range = (id, label, value) => '<div class="price-endpoint"><label for="' + id + '">' + label +
      '</label><span id="' + id + '-amount"></span><input id="' + id + '" type="range" min="' + floor +
      '" max="' + ceiling + '" step="0.01" value="' + value + '"' + (floor === ceiling ? ' disabled' : '') + '></div>';
    main.innerHTML = '<section class="wrap content">' + intro('Garagem', 'Fichas dos carros testados na pista, por tempo de volta.') +
      '<div class="filters garage-filters"><label>Marca ou modelo<input id="search" type="search" placeholder="Buscar na garagem"></label>' +
      '<label>Categoria<select id="category"><option value="">Todas</option>' +
      Object.entries(D.categories).map(([id, name]) => '<option value="' + id + '">' + name + '</option>').join('') +
      '</select></label><fieldset class="price-slider"><legend>Faixa de preço (US$)</legend>' +
      (prices.length ? range('min', 'Mínimo', floor) + range('max', 'Máximo', ceiling) : '<span>Sem preços cadastrados</span>') +
      '</fieldset></div><div id="compare-bar" class="compare-bar" aria-live="polite"></div>' +
      '<div id="result" tabindex="-1" aria-live="polite"></div></section>';
    const search = main.querySelector('#search');
    const category = main.querySelector('#category');
    const min = main.querySelector('#min');
    const max = main.querySelector('#max');
    const result = main.querySelector('#result');
    const bar = main.querySelector('#compare-bar');
    const chosen = new Set();
    function render(pageNumber = 1) {
      const low = Number(min?.value ?? floor);
      const high = Number(max?.value ?? ceiling);
      if (min) {
        main.querySelector('#min-amount').textContent = priceText(low);
        main.querySelector('#max-amount').textContent = priceText(high);
        const slider = min.closest('fieldset');
        slider.style.setProperty('--min-percent', ((low - floor) / (ceiling - floor || 1) * 100) + '%');
        slider.style.setProperty('--max-percent', ((high - floor) / (ceiling - floor || 1) * 100) + '%');
        min.setAttribute('aria-valuetext', priceText(low));
        max.setAttribute('aria-valuetext', priceText(high));
        slider.classList.toggle('minimum-front', low === high && high === ceiling);
      }
      const query = D.normalize(search.value.trim());
      const matches = byLap.filter(car => D.normalize(D.name(car)).includes(query) &&
        (!category.value || car.categoria === category.value));
      const priced = matches.filter(car => hasPrice(car.valor) && car.valor >= low && car.valor <= high);
      const unpriced = matches.filter(car => !hasPrice(car.valor));
      const items = [...priced, ...unpriced];
      const offset = (pageNumber - 1) * 20;
      const visible = items.slice(offset, offset + 20);
      const withPrice = visible.filter(car => hasPrice(car.valor));
      const withoutPrice = visible.filter(car => !hasPrice(car.valor));
      result.innerHTML = (withPrice.length ? cards(withPrice, true, chosen) : '') +
        (withoutPrice.length ? '<h2 class="subsection-title">Sem valor estimado</h2>' + cards(withoutPrice, true, chosen) : '') +
        (!visible.length ? empty('Nenhum carro encontrado.') : '');
      paginate(items.length, 20, pageNumber, result, render);
    }
    function updateComparison(message = '') {
      const selected = [...chosen];
      bar.innerHTML = '<span>' + (message || (selected.length ? escapeHtml(selected.map(id => D.name(cars.find(car => car.id === id))).join(' · ')) :
        'Selecione dois carros para comparar.')) + '</span>' +
        (selected.length ? '<button type="button" class="secondary" data-clear>Limpar seleção</button>' : '') +
        (selected.length === 2 ? '<a class="button" href="' + url('comparar') + '?' +
          new URLSearchParams({ a: selected[0], b: selected[1] }).toString().replaceAll('&', '&amp;') + '">Comparar carros</a>' : '');
    }
    result.addEventListener('click', event => {
      const button = event.target.closest('[data-compare]');
      if (!button) return;
      const id = button.dataset.compare;
      if (chosen.has(id)) chosen.delete(id);
      else if (chosen.size < 2) chosen.add(id);
      else { updateComparison('Remova um carro da seleção pra comparar outro.'); return; }
      button.textContent = chosen.has(id) ? 'Selecionado' : 'Selecionar pra comparar';
      button.setAttribute('aria-pressed', chosen.has(id));
      updateComparison();
    });
    bar.addEventListener('click', event => {
      if (!event.target.matches('[data-clear]')) return;
      chosen.clear();
      result.querySelectorAll('[data-compare]').forEach(button => {
        button.setAttribute('aria-pressed', 'false');
        button.textContent = 'Selecionar pra comparar';
      });
      updateComparison();
      search.focus();
    });
    if (min) {
      min.oninput = () => { if (+min.value > +max.value) min.value = max.value; render(); };
      max.oninput = () => { if (+max.value < +min.value) max.value = min.value; render(); };
    }
    search.oninput = category.onchange = () => render();
    updateComparison();
    render();
  }

  function compare() {
    const pair = ['a', 'b'].map(key => cars.find(car => car.id === params.get(key)));
    if (!pair.every(Boolean) || pair[0].id === pair[1].id) {
      main.innerHTML = '<section class="wrap content">' + intro('Comparar carros', 'Escolha dois carros na Garagem.') +
        link('garagem', 'Ir à Garagem') + '</section>';
      return;
    }
    const best = Math.min(...pair.map(car => car.tempo));
    const rows = [
      ['Melhor volta', car => D.lap(car.tempo)], ['Diferença entre as voltas', car => car.tempo === best ? '—' : gap(car.tempo - best)],
      ['Velocidade na pista', car => unit(car.velocidade, 'km/h')], ['Potência', car => unit(car.potencia, 'cv')],
      ['Peso', car => unit(car.peso, 'kg')], ['Valor', car => priceText(car.valor)]
    ];
    main.innerHTML = '<section class="wrap content">' + link('garagem', 'Voltar à Garagem', 'back-link') + intro('Comparar carros') +
      '<div class="table-frame compare-table"><table><thead><tr><th scope="col">Dados</th>' +
      pair.map(car => '<th scope="col"><a class="car-link" href="' + url('carro', car.id) + '">' +
        photo(car) + escapeHtml(D.name(car)) + '</a></th>').join('') + '</tr></thead><tbody>' +
      rows.map(([label, format]) => '<tr><th scope="row">' + label + '</th>' +
        pair.map(car => '<td class="lap">' + escapeHtml(format(car)) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div></section>';
  }

  function detailMarkup(car, pool, preview = false) {
    const cat = D.categories[car.categoria] || '—';
    const tech = [['Ano', car.ano], ['Categoria', cat], ['Motor', car.motor], ['Transmissão', car.transmissao],
      ['Potência', unit(car.potencia, 'cv'), 'potencia'], ['Torque', unit(car.torque, 'Nm'), 'torque'], ['Peso', unit(car.peso, 'kg'), 'peso'],
      ['Valor de referência', priceText(car.valor)]];
    const stats = [['Melhor volta', car.tempo ? D.lap(car.tempo) : '—'], ['Velocidade máxima na pista', unit(car.velocidade, 'km/h')],
      ['Posição no Geral', car.tempo ? D.position(pool, car) + 'º' : '—'],
      ['Posição em ' + cat, car.tempo && car.categoria ? D.position(pool.filter(other => other.categoria === car.categoria), car) + 'º' : '—']];
    return '<article class="wrap content detail">' +
      (preview ? '<p class="preview-label">Prévia da ficha</p>' : link('garagem', 'Voltar à Garagem', 'back-link')) +
      photo(car, false) + intro(escapeHtml(D.name(car).trim() || 'Carro sem nome'),
        'Volta Rápida nº ' + (car.episodio ? String(car.episodio).padStart(2, '0') : '—') +
        (car.teste ? ' · Dados de teste' : '')) + '<dl class="detail-stats">' + specs(stats) + '</dl>' +
      (car.historia ? '<section class="car-history"><h2>História do carro</h2><p>' + escapeHtml(car.historia) + '</p></section>' : '') +
      '<h2>Ficha técnica</h2><dl class="specs">' + specs(tech.map(([label, value, key]) =>
        [label, value, D.sourceLabels[car.fontes?.[key]]])) + '</dl></article>';
  }

  function detail() {
    if (!current) {
      main.innerHTML = '<section class="wrap content">' + intro('Ficha indisponível') +
        link('garagem', 'Voltar à Garagem') + '</section>';
      return;
    }
    document.title = D.name(current) + ' | Prestes Racing';
    main.innerHTML = detailMarkup(current, cars);
  }

  function circuit() {
    main.innerHTML = '<section class="wrap content">' + intro('Prestes Motorsport Park', 'Magione, Itália') + '</section>' +
      track() + section('Fotos da pista', '<div class="track-photos">' +
        window.FOTOS_DA_PISTA.map(({ arquivo, descricao }) => '<figure><img loading="lazy" src="' +
          escapeHtml(root + 'assets/' + arquivo) + '" alt="' + escapeHtml(descricao) + '"><figcaption>' +
          escapeHtml(descricao) + '</figcaption></figure>').join('') + '</div>');
  }

  function specs(rows) {
    return rows.map(([label, value, source]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' +
      escapeHtml(value ?? '—') + (source ? '<small>' + escapeHtml(source) + '</small>' : '') + '</dd></div>').join('');
  }

  function records() {
    const rows = Object.entries(D.categories).map(([id, label]) => {
      const leaders = D.holders(cars.filter(item => item.categoria === id), 'tempo');
      return '<tr><th scope="row">' + label + '</th><td><div class="record-holders">' +
        (leaders.map(car => link('carro', D.name(car), 'car-link', car.id)).join('') || '—') +
        '</div></td><td class="lap">' + (leaders.length ? D.lap(leaders[0].tempo) : '—') + '</td></tr>';
    }).join('');
    const history = [...(catalog.history || [])].reverse();
    const historyMarkup = history.map(item => {
      const label = item.category ? 'Melhor volta · ' + D.categories[item.category] : titles[item.metric]?.[0];
      const format = titles[item.metric]?.[1];
      return '<li><strong>' + escapeHtml(label) + '</strong><span>' +
        escapeHtml(item.before.names.join(', ')) + ' (' + escapeHtml(format({ [item.metric]: item.before.value })) +
        ') → ' + escapeHtml(item.after.names.join(', ')) + ' (' + escapeHtml(format({ [item.metric]: item.after.value })) +
        ') · Volta Rápida nº ' + escapeHtml(item.episodio) + '</span></li>';
    }).join('');
    main.innerHTML = '<section class="wrap content">' + intro('Recordes') + recordCards(true) +
      '<h2 class="subsection-title">Melhores voltas por categoria</h2><div class="table-frame"><table><thead><tr>' +
      '<th scope="col">Categoria</th><th scope="col">Carro</th><th scope="col">Melhor volta</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><details class="record-history"><summary>Histórico de recordes</summary>' +
      (historyMarkup ? '<ul>' + historyMarkup + '</ul>' : '<p>As próximas quebras de recorde aparecem aqui.</p>') +
      '</details></section>';
  }

  if (adminPages.includes(page)) {
    await window.PrestesAdmin({ D, root, page, main, params, catalog, url, link, photo, intro, empty, escapeHtml,
      detailMarkup, hasPrice });
  } else {
    ({ inicio: home, ranking, garagem: garage, carro: detail, recordes: records, pista: circuit, comparar: compare })[page]();
  }
})();
