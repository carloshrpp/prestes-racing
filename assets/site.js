(() => {
  'use strict';

  const D = window.PrestesData;
  const root = document.body.dataset.root;
  const page = document.body.dataset.page;
  const main = document.querySelector('main');
  const params = new URLSearchParams(location.search);
  const localDraft = D.preview() && location.protocol !== 'file:' ? D.readDraft() : null;
  const catalog = localDraft || window.PRESTES_CATALOGO;
  const cars = catalog.cars;
  const byLap = D.ordered(cars);
  const byEpisode = D.latest(cars);
  const current = cars.find(car => car.id === params.get('id'));
  const nav = { inicio: ['', 'Início'], ranking: ['ranking/', 'Ranking'], garagem: ['garagem/', 'Garagem'],
    recordes: ['recordes/', 'Recordes'], gerenciar: ['gerenciar/', 'Gerenciar'],
    adicionar: ['gerenciar/adicionar/'], editar: ['gerenciar/editar/'], carro: ['garagem/carro/'] };
  const titles = {
    tempo: ['Volta mais rápida', car => D.lap(car.tempo)],
    velocidade: ['Maior velocidade na pista', car => D.decimal.format(car.velocidade) + ' km/h'],
    potencia: ['Maior potência', car => D.decimal.format(car.potencia) + ' cv']
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
  const unit = (value, symbol) => D.decimal.format(value) + ' ' + symbol;
  const hasPrice = value => Number.isFinite(value) && value > 0;
  const priceText = value => hasPrice(value) ? D.currency.format(value) : 'Sem valor estimado';
  const base = page === 'carro' ? 'garagem' : ['adicionar', 'editar'].includes(page) ? 'gerenciar' : page;
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

  function rankingTable(rows, pool = rows, order = 'tempo', offset = 0) {
    const column = { potencia: ['Potência', 'cv'], velocidade: ['Velocidade na pista', 'km/h'], peso: ['Peso', 'kg'] }[order];
    const content = rows.map((car, index) => {
      const pos = order === 'tempo' ? D.position(pool, car) : offset + index + 1;
      const medal = order === 'tempo' && pos <= 3 ? ' podium-' + pos : '';
      return '<tr><td class="rank-number' + medal + '">' + pos + 'º</td><th scope="row">' +
        link('carro', D.name(car), 'car-link', car.id) + '</th><td>' + D.categories[car.categoria] +
        '</td><td class="lap">' + D.lap(car.tempo) + '</td>' +
        (column ? '<td class="lap">' + unit(car[order], column[1]) + '</td>' : '') + '</tr>';
    }).join('');
    return '<div class="table-frame"><table><thead><tr><th scope="col">Pos.</th><th scope="col">Carro</th>' +
      '<th scope="col">Categoria</th><th scope="col">Melhor volta</th>' +
      (column ? '<th scope="col">' + column[0] + '</th>' : '') +
      '</tr></thead><tbody>' + (content || '<tr><td class="table-empty" colspan="' +
      (column ? 5 : 4) + '">Nenhuma volta foi registrada nesta classificação.</td></tr>') + '</tbody></table></div>';
  }

  function cards(items, showPrice) {
    if (!items.length) return empty('Nenhum carro encontrado.');
    return '<div class="car-grid' + (showPrice ? ' garage-grid' : '') + '">' +
      items.map(car => '<a class="car-card" href="' + url('carro', car.id) + '">' + photo(car) +
        '<div class="card-copy"><h3>' + escapeHtml(D.name(car)) + '</h3><span class="lap">' + D.lap(car.tempo) +
        '</span>' + (showPrice ? '<span class="price">' + priceText(car.valor) + '</span>' : '') +
        '</div></a>').join('') + '</div>';
  }

  function recordCards(withPhoto) {
    return '<div class="record-grid">' + Object.entries(titles).map(([order, [title, format]]) => {
      const car = D.ordered(cars, order)[0];
      const content = (withPhoto && car ? photo(car) : '') + '<div class="card-copy"><h3>' + title + '</h3>' +
        '<strong class="record-value">' + (car ? format(car) : '—') + '</strong><span>' +
        (car ? escapeHtml(D.name(car)) : 'Aguardando a primeira volta') + '</span></div>';
      return car ? '<a class="record-card" href="' + url('carro', car.id) + '">' + content + '</a>' :
        '<article class="record-card">' + content + '</article>';
    }).join('') + '</div>';
  }

  function track() {
    return '<section class="track-section"><div class="wrap track-grid"><figure><img loading="lazy" src="' +
      root + 'assets/tracado-magione.png" alt="Traçado de Magione com as 11 curvas numeradas">' +
      '<figcaption>Traçado adaptado de <a href="https://commons.wikimedia.org/wiki/File:Autodromo_di_Magione_Track_Layout.svg">Blanders506</a> · ' +
      '<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></figcaption></figure>' +
      '<div><h2>Conheça a pista</h2><p>Inaugurado em 1973 na Úmbria, na Itália, o Autódromo de Magione nasceu por iniciativa da Scuderia Carpine. ' +
      'O traçado original tinha 1.650 metros e logo se destacou pela pilotagem técnica. Em 1996, a pista foi ampliada para 2.507 metros, ' +
      'com novos boxes e um paddock maior.</p>' +
      '<p>Na história do Prestes Racing, Carlos Prestes comprou o autódromo em 2026 e o rebatizou de <strong>Prestes Motorsport Park</strong>. ' +
      'A reforma modernizou o circuito de ponta a ponta, com asfalto novo, áreas de escape ampliadas, novas arquibancadas e um complexo de boxes e paddock renovado. ' +
      'O autódromo virou a casa das voltas rápidas do canal e ganhou estrutura para receber provas de <strong>GT3, Fórmula 4 e outras categorias de turismo e monopostos</strong>.</p>' +
      '<dl class="track-stats"><div><dt>Extensão</dt><dd>2.507 m</dd></div><div><dt>Curvas</dt><dd>11</dd></div>' +
      '<div><dt>Local</dt><dd>Magione, Itália</dd></div></dl></div></div></section>';
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
      section('Último episódio', last ? '<article class="featured">' + photo(last) + '<div class="card-copy"><span>Episódio ' +
        String(last.episodio).padStart(2, '0') + '</span><h3>' + escapeHtml(D.name(last)) + '</h3>' +
        link('carro', 'Ver ficha do carro', 'button', last.id) + '</div></article>' : empty('Os dados do primeiro episódio aparecem aqui assim que forem publicados.')) +
      track();
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
    main.innerHTML = '<section class="wrap content">' + intro('Ranking', 'Classificação das voltas do Prestes Racing em Magione.') +
      '<div class="filters"><div id="categories" class="chips" aria-label="Categoria">' +
      Object.entries({ geral: 'Geral', ...D.categories }).map(([id, name]) =>
        '<button type="button" data-category="' + id + '" aria-pressed="' + (id === 'geral') + '">' + name + '</button>'
      ).join('') + '</div><label>Ordenar por<select id="order">' +
      Object.entries(D.orders).map(([id, [name]]) => '<option value="' + id + '">' + name + '</option>').join('') +
      '</select></label></div><div id="result" tabindex="-1" aria-live="polite"></div></section>';
    const result = main.querySelector('#result');
    const order = main.querySelector('#order');
    let category = 'geral';
    function render(pageNumber = 1) {
      const list = D.ordered(category === 'geral' ? cars : cars.filter(car => car.categoria === category), order.value);
      const offset = (pageNumber - 1) * 25;
      result.innerHTML = rankingTable(list.slice(offset, offset + 25), list, order.value, offset);
      paginate(list.length, 25, pageNumber, result, render);
    }
    main.querySelectorAll('[data-category]').forEach(button => button.onclick = () => {
      main.querySelector('[aria-pressed="true"]').setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      category = button.dataset.category;
      render();
    });
    order.onchange = () => render();
    render();
  }

  function garage() {
    main.innerHTML = '<section class="wrap content">' + intro('Garagem', 'Fichas dos carros testados na pista, por tempo de volta.') +
      '<div class="filters garage-filters"><label>Marca ou modelo<input id="search" type="search" placeholder="Buscar na garagem"></label>' +
      '<fieldset><legend>Faixa de preço (R$)</legend><label>Mínimo<input id="min" type="number" min="0" inputmode="decimal"></label>' +
      '<label>Máximo<input id="max" type="number" min="0" inputmode="decimal"></label></fieldset></div>' +
      '<div id="result" tabindex="-1" aria-live="polite"></div></section>';
    const search = main.querySelector('#search');
    const min = main.querySelector('#min');
    const max = main.querySelector('#max');
    const result = main.querySelector('#result');
    function render(pageNumber = 1) {
      const low = min.value ? Number(min.value) : 0;
      const high = max.value ? Number(max.value) : Infinity;
      if (low < 0 || high < low) { result.innerHTML = empty('Informe uma faixa de preço válida.'); return; }
      const query = D.normalize(search.value.trim());
      const hasRange = min.value !== '' || max.value !== '';
      const items = byLap.filter(car => D.normalize(D.name(car)).includes(query) &&
        (!hasRange || (hasPrice(car.valor) && car.valor >= low && car.valor <= high)));
      const offset = (pageNumber - 1) * 20;
      result.innerHTML = cards(items.slice(offset, offset + 20), true);
      paginate(items.length, 20, pageNumber, result, render);
    }
    [search, min, max].forEach(input => input.oninput = () => render());
    render();
  }

  function detail() {
    if (!current) {
      main.innerHTML = '<section class="wrap content">' + intro('Ficha indisponível') +
        link('garagem', 'Voltar à Garagem') + '</section>';
      return;
    }
    const car = current;
    const cat = D.categories[car.categoria];
    const tech = [['Ano', car.ano], ['Categoria', cat], ['Motor', car.motor], ['Transmissão', car.transmissao],
      ['Potência', unit(car.potencia, 'cv')], ['Torque', unit(car.torque, 'Nm')], ['Peso', unit(car.peso, 'kg')],
      ['Valor', priceText(car.valor)]];
    const stats = [['Melhor volta', D.lap(car.tempo)], ['Velocidade máxima na pista', unit(car.velocidade, 'km/h')],
      ['Posição no Geral', D.position(cars, car) + 'º'],
      ['Posição em ' + cat, D.position(cars.filter(other => other.categoria === car.categoria), car) + 'º']];
    document.title = D.name(car) + ' | Prestes Racing';
    main.innerHTML = '<article class="wrap content detail">' + link('garagem', 'Voltar à Garagem', 'back-link') + photo(car, false) +
      intro(escapeHtml(D.name(car)), 'Episódio ' + String(car.episodio).padStart(2, '0') + (car.teste ? ' · Dados fictícios para teste' : '')) +
      '<dl class="detail-stats">' + specs(stats) + '</dl><h2>Ficha técnica</h2><dl class="specs">' + specs(tech) + '</dl></article>';
  }

  function specs(rows) {
    return rows.map(([label, value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' +
      escapeHtml(value) + '</dd></div>').join('');
  }

  function records() {
    const rows = Object.entries(D.categories).map(([id, label]) => {
      const car = byLap.find(item => item.categoria === id);
      return '<tr><th scope="row">' + label + '</th><td>' + (car ? link('carro', D.name(car), 'car-link', car.id) : '—') +
        '</td><td class="lap">' + (car ? D.lap(car.tempo) : '—') + '</td></tr>';
    }).join('');
    main.innerHTML = '<section class="wrap content">' + intro('Recordes') + recordCards(true) +
      '<h2 class="subsection-title">Melhores voltas por categoria</h2><div class="table-frame"><table><thead><tr>' +
      '<th scope="col">Categoria</th><th scope="col">Carro</th><th scope="col">Melhor volta</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></section>';
  }

  function admin() {
    const rows = byEpisode.map(car => '<li><span><strong>' + escapeHtml(D.name(car)) + '</strong><small>' +
      D.categories[car.categoria] + ' · Episódio ' + car.episodio + '</small></span>' +
      link('editar', 'Editar', 'button secondary', car.id) + '</li>').join('');
    main.innerHTML = '<section class="wrap content">' + intro('Gerenciar', 'Cadastre e atualize os carros do Prestes Racing.') +
      '<div class="admin-bar"><label>Buscar carro<input type="search" id="admin-search" placeholder="Marca ou modelo"></label>' +
      link('adicionar', 'Adicionar carro') + '</div><ul id="admin-list" class="admin-list">' + rows + '</ul>' +
      '<div id="admin-empty" class="empty"><p>Nenhum carro encontrado.</p></div>' + tokenPanel() + '</section>';
    main.querySelector('#admin-empty').hidden = cars.length > 0;
    main.querySelector('#admin-search').oninput = event => {
      const query = D.normalize(event.target.value.trim());
      const items = [...main.querySelectorAll('#admin-list li')];
      items.forEach((item, index) => { item.hidden = !D.normalize(D.name(byEpisode[index])).includes(query); });
      main.querySelector('#admin-empty').hidden = items.some(item => !item.hidden);
    };
    tokenControls();
  }

  function tokenPanel() {
    return '<section class="token-panel"><h2>Publicação no GitHub</h2><p>Repositório <strong>' + D.remote +
      '</strong>. Use um token com permissão de leitura e escrita em <strong>Contents</strong>.</p>' +
      '<div class="admin-bar"><label>Token do GitHub<input id="token" type="password" autocomplete="off" spellcheck="false"></label>' +
      '<button type="button" id="validate" class="secondary">Validar token</button></div>' +
      '<p id="token-status" class="status" role="status"></p></section>';
  }

  function tokenControls() {
    const input = main.querySelector('#token');
    const status = main.querySelector('#token-status');
    const validate = main.querySelector('#validate');
    const writeButtons = main.querySelectorAll('#publish, #confirm-delete');
    let access = null;
    input.addEventListener('input', () => {
      access = null;
      status.textContent = '';
      writeButtons.forEach(button => { button.disabled = true; });
    });
    validate.onclick = async () => {
      const token = input.value.trim();
      if (!token) { status.textContent = 'Informe o token do GitHub.'; input.focus(); return; }
      validate.disabled = true;
      input.disabled = true;
      status.textContent = 'Validando com o GitHub…';
      try {
        access = { token, branch: await D.validateToken(token) };
        status.textContent = 'Token validado com permissão de escrita.';
        writeButtons.forEach(button => { button.disabled = false; });
      } catch (error) {
        status.textContent = error.message;
      } finally {
        validate.disabled = false;
        input.disabled = false;
      }
    };
    return () => access;
  }

  function carForm() {
    const edit = page === 'editar';
    const localPreview = D.preview() && location.protocol !== 'file:';
    if (edit && !current) {
      main.innerHTML = '<section class="wrap content">' + intro('Ficha indisponível') +
        link('gerenciar', 'Voltar a Gerenciar') + '</section>';
      return;
    }
    const inputs = [
      ['marca', 'Marca'], ['modelo', 'Modelo'], ['ano', 'Ano', 'number', '1886', '2100', '1'],
      ['episodio', 'Episódio', 'number', '1', '99999', '1'], ['motor', 'Motor'], ['transmissao', 'Transmissão'],
      ['potencia', 'Potência (cv)', 'number'], ['torque', 'Torque (Nm)', 'number'], ['peso', 'Peso (kg)', 'number'],
      ['tempo', 'Melhor volta', 'text'],
      ['velocidade', 'Velocidade máxima na pista (km/h)', 'number']
    ];
    const ids = crypto.randomUUID ? () => crypto.randomUUID() : () =>
      Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const id = current?.id || ids();
    function field([key, name, type = 'text', min = '0.01', max = '999999999', step = '0.01']) {
      const value = key === 'tempo' && current ? D.lap(current.tempo) : current?.[key] ?? '';
      const constraints = type === 'number' ? ' min="' + min + '" max="' + max + '" step="' + step + '"' :
        key === 'tempo' ? ' placeholder="1:12.870" pattern="[0-9]{1,2}:[0-5][0-9][.,][0-9]{3}"' : ' maxlength="100"';
      return '<label>' + name + '<input required name="' + key + '" type="' + type + '" value="' +
        escapeHtml(value) + '"' + constraints + '></label>';
    }
    const category = '<label>Categoria<select required name="categoria"><option value="">Selecione</option>' +
      Object.entries(D.categories).map(([key, name]) => '<option value="' + key + '"' +
        (current?.categoria === key ? ' selected' : '') + '>' + name + '</option>').join('') + '</select></label>';
    const unknownPrice = edit && !hasPrice(current.valor);
    const priceField = '<div class="price-field"><label>Valor (R$)<input name="valor" type="number" min="0.01" max="999999999" step="0.01"' +
      (unknownPrice ? ' disabled' : ' required') + ' value="' + (hasPrice(current?.valor) ? current.valor : '') +
      '"></label><label class="price-option"><input id="unknown-price" name="semValor" type="checkbox"' +
      (unknownPrice ? ' checked' : '') + '> Sem valor estimado</label></div>';
    main.innerHTML = '<section class="wrap content form-page">' + link('gerenciar', 'Voltar a Gerenciar', 'back-link') +
      intro(edit ? 'Editar carro' : 'Adicionar carro') +
      '<form id="car-form"><h2>Ficha técnica</h2><div class="form-grid">' + inputs.slice(0, -2).map(field).join('') +
      priceField + category + '</div><h2>Dados da volta</h2><div class="form-grid">' + inputs.slice(-2).map(field).join('') +
      '</div><h2>Foto no showroom</h2><label>Arquivo JPG, PNG ou WebP<input name="foto" type="file" accept="image/jpeg,image/png,image/webp"' +
      (edit ? '' : ' required') + '></label>' + (edit ? '<div class="form-photo">' + photo(current) + '</div>' : '') +
      tokenPanel() + '<div class="form-actions"><button id="publish" type="submit" disabled>Publicar</button>' +
      (localPreview ? '<button id="local-save" type="submit" class="secondary">Salvar teste local</button>' : '') +
      '</div><p class="status" id="save-status" role="status"></p>' +
      (edit ? removalPanel(localPreview) : '') + '</form></section>';
    const getAccess = tokenControls();
    const form = main.querySelector('#car-form');
    const status = main.querySelector('#save-status');
    const priceInput = form.elements.namedItem('valor');
    const noPrice = form.elements.namedItem('semValor');
    function updatePriceField() {
      priceInput.disabled = noPrice.checked;
      priceInput.required = !noPrice.checked;
    }
    noPrice.onchange = updatePriceField;
    updatePriceField();
    if (edit) removalControls(form, getAccess);
    form.onsubmit = async event => {
      event.preventDefault();
      const local = event.submitter?.id === 'local-save';
      const access = getAccess();
      if (!local && !access) { status.textContent = 'Valide o token para publicar.'; return; }
      const data = new FormData(form);
      const car = { id, criado: current?.criado || new Date().toISOString(), ...(current?.teste && { teste: true }) };
      for (const [key, label, type] of inputs) {
        const value = data.get(key).trim();
        if (!value) { status.textContent = 'Preencha ' + label.toLowerCase() + '.'; return; }
        car[key] = key === 'tempo' ? D.parseLap(value) : type === 'number' ? Number(value) : value;
      }
      if (!car.tempo) { status.textContent = 'Informe uma volta maior que zero.'; return; }
      car.valor = data.has('semValor') ? null : Number(data.get('valor'));
      if (car.valor !== null && !hasPrice(car.valor)) {
        status.textContent = 'Informe um valor em reais ou marque Sem valor estimado.';
        return;
      }
      car.categoria = data.get('categoria');
      const buttons = [...form.querySelectorAll('button')];
      const oldDisabled = buttons.map(button => button.disabled);
      buttons.forEach(button => { button.disabled = true; });
      status.textContent = local ? 'Salvando teste…' : 'Publicando no GitHub…';
      let done = false;
      try {
        const file = data.get('foto');
        const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        let newPhoto;
        if (file.size) {
          if (!extensions[file.type]) throw new Error('Selecione uma foto JPG, PNG ou WebP.');
          if (file.size > 8 * 1024 * 1024) throw new Error('A foto deve ter até 8 MB.');
          newPhoto = await loadPhoto(file);
          car.foto = local ? newPhoto : 'assets/carros/' + id + '.webp';
        } else {
          car.foto = current?.foto;
          if (!local && car.foto?.startsWith('data:')) {
            newPhoto = car.foto;
            car.foto = 'assets/carros/' + id + '.webp';
          }
        }
        if (!car.foto && !car.teste) throw new Error('Envie uma foto do showroom.');
        car.foto ??= null;
        if (local) {
          D.saveDraft(D.upsert(catalog, car, current));
          location.href = url('carro', car.id);
        } else {
          const sha = await D.publish(access.token, access.branch, car, current, newPhoto);
          status.innerHTML = 'Ficha salva no GitHub. A disponibilidade no site depende da publicação do GitHub Pages. ' +
            '<a href="https://github.com/' + D.remote + '/commit/' + sha + '">Ver publicação</a>';
          done = true;
        }
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.';
      } finally {
        if (!done) buttons.forEach((button, index) => { button.disabled = oldDisabled[index]; });
      }
    };
  }

  function removalPanel(localPreview) {
    return '<details id="remove-car" class="token-panel"><summary>Excluir carro</summary>' +
      '<p>Remover <strong>' + escapeHtml(D.name(current)) + '</strong> do catálogo? A ficha sai da Garagem, e o Ranking e os Recordes são recalculados. ' +
      'Valide o token acima para confirmar a exclusão no GitHub.</p><div class="form-actions">' +
      '<button type="button" id="confirm-delete" disabled>Confirmar exclusão</button>' +
      '<button type="button" id="cancel-delete" class="secondary">Cancelar</button>' +
      (localPreview ? '<button type="button" id="local-delete" class="secondary">Excluir teste local</button>' : '') +
      '</div><p class="status" id="delete-status" role="status"></p></details>';
  }

  function removalControls(form, getAccess) {
    const details = form.querySelector('#remove-car');
    const status = form.querySelector('#delete-status');
    const cancel = form.querySelector('#cancel-delete');
    const local = form.querySelector('#local-delete');
    const token = form.querySelector('#token');
    const summary = details.querySelector('summary');
    cancel.onclick = () => {
      details.open = false;
      summary.focus();
    };
    form.querySelector('#confirm-delete').onclick = () => submitRemoval(false);
    if (local) local.onclick = () => submitRemoval(true);

    async function submitRemoval(isLocal) {
      const access = getAccess();
      if (!isLocal && !access) return;
      const controls = [...form.querySelectorAll('button'), token];
      const states = controls.map(control => control.disabled);
      controls.forEach(control => { control.disabled = true; });
      status.textContent = isLocal ? 'Excluindo teste local…' : 'Excluindo no GitHub…';
      try {
        if (isLocal) {
          D.saveDraft(D.remove(D.readDraft() || catalog, current));
          location.href = url('gerenciar');
        } else {
          await D.publishRemoval(access.token, access.branch, current);
          status.textContent = 'Carro excluído no GitHub. O site será atualizado pelo GitHub Pages.';
        }
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Não foi possível excluir. Tente novamente.';
        controls.forEach((control, index) => { control.disabled = states[index]; });
      }
    }
  }

  async function loadPhoto(file) {
    let img;
    try { img = await createImageBitmap(file); }
    catch { throw new Error('Não foi possível abrir a foto. Selecione outro arquivo.'); }
    const scale = Math.min(1, 1440 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    img.close();
    return canvas.toDataURL('image/webp', 0.85);
  }

  ({ inicio: home, ranking, garagem: garage, carro: detail, recordes: records,
    gerenciar: admin, adicionar: carForm, editar: carForm })[page]();
})();
