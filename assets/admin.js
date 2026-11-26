(() => {
  'use strict';

  const fields = [
    ['marca', 'Marca'], ['modelo', 'Modelo'], ['ano', 'Ano', 'number', 1886, 2100, 1],
    ['episodio', 'Número da Volta Rápida', 'number', 1, 99999, 1],
    ['motor', 'Motor'], ['transmissao', 'Transmissão'],
    ['potencia', 'Potência (cv)', 'number', .01, 999999999, .01],
    ['torque', 'Torque (Nm)', 'number', .01, 999999999, .01],
    ['peso', 'Peso (kg)', 'number', .01, 999999999, .01],
    ['tempo', 'Melhor volta'],
    ['velocidade', 'Velocidade máxima na pista (km/h)', 'number', .01, 999999999, .01]
  ];
  const fileTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const imageReminder = 'Falta foto do showroom';
  const newId = () => crypto.randomUUID();

  async function loadPhoto(file) {
    if (!fileTypes.includes(file.type)) throw new Error('Selecione uma foto JPG, PNG ou WebP.');
    if (file.size > 8 * 1024 * 1024) throw new Error('A foto deve ter até 8 MB.');
    const image = await createImageBitmap(file).catch(() => null);
    if (!image) throw new Error('Não foi possível abrir a foto.');
    const scale = Math.min(1, 1440 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const encoded = canvas.toDataURL('image/webp', .85);
    if (!encoded.startsWith('data:image/webp;base64,')) throw new Error('Abra o Gerenciar em um navegador com suporte a WebP.');
    return encoded;
  }

  window.PrestesAdmin = async function ({ D, root, page, main, params, catalog, url, link, photo, intro, empty,
    escapeHtml: esc, detailMarkup, hasPrice }) {
    const local = D.preview();
    const workKey = 'admin';
    const sessionKey = 'prestes-v2-session:' + new URL(root, location.href).pathname;
    const id = params.get('id');
    const selectedLotId = params.get('lote');
    const draftForNewLot = params.get('rascunho');
    const defaultWork = { revision: 0, drafts: [], lots: [], receipts: [], pending: {} };
    let work;
    let access;
    let busy = false;
    let receiptTimer;

    if (location.protocol === 'file:') {
      main.innerHTML = '<section class="wrap content">' + intro('Gerenciar') +
        '<div class="token-panel"><h2>Gerenciar no site publicado</h2>' +
        '<p>Depois de enviar a atualização ao GitHub, abra o Gerenciar no site e valide o token. ' +
        'De lá você já pode editar um carro e abrir a prévia da ficha antes de publicar.</p>' +
        '<a class="button" href="https://carloshrpp.github.io/prestes-racing/gerenciar/index.html">' +
        'Abrir Gerenciar no site</a></div></section>';
      return;
    }
    if (!local && location.origin !== 'https://carloshrpp.github.io') {
      main.innerHTML = '<section class="wrap content">' + intro('Gerenciar') +
        '<p>Abra o site publicado para conectar ao GitHub ou use o servidor local para testar.</p></section>';
      return;
    }
    try {
      work = await D.load(workKey) || defaultWork;
      access = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    } catch (error) {
      main.innerHTML = '<section class="wrap content">' + intro('Gerenciar') + empty(esc(error.message)) + '</section>';
      return;
    }

    const draftName = draft => D.name(draft.car).trim() || 'Carro sem nome';
    const draftUrl = draft => url('editar', draft.car.id) + '&amp;rascunho=1';
    const lotUrl = lotId => url('lotes', lotId);
    const previewUrl = draft => url('previa', draft.car.id);
    const lotName = lotId => work.lots.find(lot => lot.id === lotId)?.name || '';
    const status = () => main.querySelector('#admin-status');
    const tell = message => { if (status()) status().textContent = message; };
    const go = href => { location.href = href.replaceAll('&amp;', '&'); };

    async function update(next) {
      const replacement = { ...next, revision: work.revision + 1 };
      await D.save(workKey, replacement, work.revision);
      work = replacement;
    }

    function saveAccess(value) {
      if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
      else sessionStorage.removeItem(sessionKey);
      access = value;
    }

    function signIn() {
      const body = local ?
        '<p>As publicações de teste ficam neste navegador.</p><button id="local-session" type="button">Entrar no modo de prévia</button>' :
        '<p>Use um token do repositório <strong>' + D.remote + '</strong> com permissão de leitura e escrita em Contents.</p>' +
        '<form id="login"><div class="admin-bar"><label>Token do GitHub<input name="token" type="password" autocomplete="off" ' +
        'spellcheck="false" required></label><button type="submit">Validar token</button></div></form>';
      main.innerHTML = '<section class="wrap content">' + intro('Gerenciar') + '<div class="token-panel">' +
        body + '<p id="admin-status" class="status" role="status"></p></div></section>';
      if (local) {
        main.querySelector('#local-session').onclick = () => {
          saveAccess({ local: true });
          render();
        };
        return;
      }
      main.querySelector('#login').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const token = form.elements.token.value.trim();
        if (!token) { tell('Informe o token.'); return; }
        const button = form.querySelector('button');
        button.disabled = true;
        tell('Validando com o GitHub…');
        try {
          const branch = await D.validateToken(token);
          const latest = await D.readRemote(token, branch);
          catalog = latest;
          saveAccess({ token, branch });
          render();
        } catch (error) {
          tell(error.message);
          button.disabled = false;
        }
      };
    }

    function problems(draft) {
      const { car } = draft;
      const errors = [];
      for (const [key, label, type, min, max, step] of fields) {
        const value = car[key];
        if (key === 'tempo') {
          if (!value) errors.push(draft.lapInput ? 'Tempo inválido. Use 1:25.553.' : 'Preencha Melhor volta.');
        } else if (type === 'number') {
          if (!Number.isFinite(value)) errors.push('Preencha ' + label + '.');
          else if (value < min || value > max || (step === 1 && !Number.isInteger(value))) errors.push(label + ' inválido.');
        } else if (!value) errors.push('Preencha ' + label + '.');
      }
      if (!D.categories[car.categoria]) errors.push('Escolha uma categoria.');
      if (!hasPrice(car.valor) && car.valor !== null) errors.push('Informe o valor ou marque Sem valor estimado.');
      if (hasPrice(car.valor) && car.valor > 999999999) errors.push('Valor de referência fora do limite do campo.');
      const others = [...catalog.cars, ...work.drafts.map(item => item.car)].filter(item => item.id !== car.id);
      const duplicateNumber = car.episodio && others.find(item => item.episodio === car.episodio);
      if (duplicateNumber) errors.push('Volta Rápida nº ' + car.episodio + ' já está em uso em ' + D.name(duplicateNumber).trim() + '.');
      if (car.marca && car.modelo && car.ano && others.some(item => item.ano === car.ano &&
        D.normalize(D.name(item)) === D.normalize(D.name(car)))) errors.push('Já existe outra ficha para este carro e ano.');
      const draftOriginal = draft.original && catalog.cars.find(item => item.id === draft.original.id);
      if (draft.original && JSON.stringify(draftOriginal) !== JSON.stringify(draft.original)) {
        errors.push('A ficha publicada mudou desde que este rascunho foi criado.');
      }
      const reminders = [...new Set([
        ...(draft.notes || []), ...(!car.foto && !draft.photo ? [imageReminder] : [])
      ])];
      return { errors, reminders };
    }

    function summary(drafts) {
      return drafts.reduce((result, draft) => {
        const { errors, reminders } = problems(draft);
        result.ready += Number(errors.length === 0);
        result.errors += errors.length;
        result.reminders += reminders.length;
        result.edited += Number(Boolean(draft.original));
        return result;
      }, { ready: 0, errors: 0, reminders: 0, edited: 0 });
    }

    function summaryText(items) {
      const totals = summary(items);
      return totals.ready + ' prontos · ' + totals.errors + ' erros · ' + totals.reminders + ' pendências';
    }

    function issues() {
      const rows = work.drafts.map(draft => {
        const { errors, reminders } = problems(draft);
        if (!errors.length && !reminders.length) return '';
        return '<li><div><strong>' + esc(draftName(draft)) + '</strong>' +
          (draft.lotId ? '<small>Lote: ' + esc(lotName(draft.lotId)) + '</small>' : '') +
          errors.map(error => '<small class="issue-error">' + esc(error) + '</small>').join('') +
          reminders.map(note => '<small>' + esc(note) + '</small>').join('') + '</div><a class="button secondary" href="' +
          draftUrl(draft) + '">Corrigir</a></li>';
      }).join('');
      return '<details class="token-panel" id="issues"><summary>Painel de erros e pendências · ' +
        summaryText(work.drafts) + '</summary>' + (rows ? '<ul class="admin-list">' + rows + '</ul>' :
        '<p>Nenhum erro ou pendência nos rascunhos.</p>') + '</details>';
    }

    function receipts() {
      if (!work.receipts.length) return '';
      return '<section class="token-panel"><h2>Publicações</h2><ul class="admin-list">' +
        work.receipts.slice(0, 8).map(item => '<li><div><strong>' + esc(item.title) + '</strong>' +
          (!local ? '<small>Salvo no GitHub' + (item.sha ? ' · <a class="car-link" href="https://github.com/' + D.remote + '/commit/' +
            esc(item.sha) + '">Ver commit</a>' : '') + '</small>' : '') +
          '<small data-receipt="' + esc(item.id) + '">' + (local ? 'Publicado na prévia local' :
            item.visible ? 'Já aparece no site' : 'Aguardando atualização') + '</small></div></li>').join('') +
        '</ul>' + (!local && work.receipts.some(item => !item.visible) ?
          '<button class="secondary" type="button" id="check-site">Conferir atualização</button>' : '') + '</section>';
    }

    async function checkSite() {
      if (busy || local || !work.receipts.some(item => !item.visible)) return;
      try {
        const response = await fetch(root + 'data/carros.js?publicacao=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) return;
        const online = D.parseCatalog(await response.text());
        if (busy) return;
        const visible = [];
        for (const item of work.receipts) {
          if (!item.visible && online.publications?.includes(item.id)) {
            visible.push(item.id);
            const label = main.querySelector('[data-receipt="' + item.id + '"]');
            if (label) label.textContent = 'Já aparece no site';
          }
        }
        if (visible.length) {
          await update({ ...work, receipts: work.receipts.map(item =>
            visible.includes(item.id) ? { ...item, visible: true } : item) });
        }
      } catch {
        // The published site may still be deploying. Keep the last confirmed status.
      }
    }

    function frame(title, body, { panels = true } = {}) {
      const active = ['adicionar', 'editar', 'previa'].includes(page) ? '' : page;
      main.innerHTML = '<section class="wrap content admin-content"><nav aria-label="Área de gestão" class="admin-nav">' +
        [['gerenciar', 'Carros'], ['rascunhos', 'Rascunhos'], ['lotes', 'Lotes']].map(([target, label]) =>
          '<a class="button secondary" href="' + url(target) + '"' + (active === target ? ' aria-current="page"' : '') +
          '>' + label + '</a>').join('') + '<button class="secondary" id="logout" type="button">Encerrar sessão</button></nav>' +
        intro(title) + (local ? '<p class="preview-label">Modo de prévia local</p>' : '') +
        (panels ? issues() : '') + '<p id="admin-status" class="status" role="status"></p>' + body +
        (panels ? receipts() : '') + '</section>';
      main.querySelector('#logout').onclick = () => { saveAccess(null); signIn(); };
      const check = main.querySelector('#check-site');
      if (check) check.onclick = checkSite;
    }

    function registerQuick() {
      return '<details class="token-panel"><summary>Registro rápido</summary><form id="quick" class="quick-form">' +
        '<div class="form-grid"><label>Carro<input name="carro" placeholder="Ex.: Mitsubishi Lancer Evolution IX" ' +
        'maxlength="200" required></label><label>Tempo<input name="tempo" placeholder="1:25.553" required></label>' +
        '<label>Velocidade na pista (km/h)<input name="velocidade" type="number" min="0.01" step=".01" required></label></div>' +
        '<button type="submit">Salvar em Rascunhos</button><p id="quick-status" role="status" class="status"></p></form></details>';
    }

    function showCars() {
      const cars = D.latest(catalog.cars);
      frame('Gerenciar carros', '<div class="admin-bar"><label>Buscar carro<input id="published-search" type="search" ' +
        'placeholder="Marca ou modelo"></label>' + link('adicionar', 'Adicionar carro') + '</div>' + registerQuick() +
        '<ul id="published-list" class="admin-list">' + cars.map(car => '<li data-name="' + esc(D.normalize(D.name(car))) +
          '"><span><strong>' + esc(D.name(car)) + '</strong><small>' + D.categories[car.categoria] + ' · Volta Rápida nº ' +
          car.episodio + '</small></span>' + link('editar', 'Editar', 'button secondary', car.id) + '</li>').join('') +
        '</ul><p id="no-published" hidden>Nenhum carro encontrado.</p>');
      const rows = [...main.querySelectorAll('#published-list li')];
      main.querySelector('#published-search').oninput = event => {
        const query = D.normalize(event.target.value.trim());
        rows.forEach(row => { row.hidden = !row.dataset.name.includes(query); });
        main.querySelector('#no-published').hidden = rows.some(row => !row.hidden);
      };
      main.querySelector('#no-published').hidden = rows.length > 0;
      main.querySelector('#quick').onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const note = form.querySelector('#quick-status');
        const data = new FormData(form);
        const nome = data.get('carro').trim();
        const tempo = D.parseLap(data.get('tempo'));
        if (!nome || !tempo) { note.textContent = 'Informe o carro e um tempo no formato 1:25.553.'; return; }
        const car = { id: newId(), criado: new Date().toISOString(), marca: '', modelo: nome,
          tempo, velocidade: Number(data.get('velocidade')) };
        const draft = { car, original: null, notes: [imageReminder], updated: newId() };
        busy = true;
        try {
          await update({ ...work, drafts: [...work.drafts, draft] });
          const pending = main.querySelector('#issues');
          pending.outerHTML = issues();
          form.reset();
          note.textContent = nome + ' salvo em Rascunhos.';
        } catch (error) { note.textContent = error.message; }
        finally { busy = false; }
      };
    }

    function lotDraftActions(draft, lot) {
      const options = work.lots.filter(item => item.id !== lot.id).map(item =>
        '<option value="' + esc(item.id) + '">' + esc(item.name) + '</option>').join('');
      const holder = esc(draft.car.id);
      return '<form class="form-actions" data-lot-draft="' + holder + '">' +
        (options ? '<label>Destino<select name="destino" aria-label="Destino de ' + esc(draftName(draft)) +
          '" required><option value="">Escolha outro lote</option>' + options +
          '</select></label><button type="submit" class="secondary">Mover para outro lote</button>' : '') +
        '<button type="button" class="secondary" data-unassign>Mover para Rascunhos</button></form>';
    }

    function draftList(drafts, lot) {
      if (!drafts.length) return empty('Nenhum rascunho encontrado.');
      return '<ul class="admin-list draft-list">' + drafts.map(draft => {
        const { errors, reminders } = problems(draft);
        return '<li data-has-photo-pending="' + reminders.includes(imageReminder) + '"><div><strong>' + esc(draftName(draft)) +
          '</strong><small>' + esc([draft.car.episodio && 'Volta Rápida nº ' + draft.car.episodio,
            draft.car.tempo && D.lap(draft.car.tempo), draft.lotId && 'Lote: ' + lotName(draft.lotId),
            errors.length ? errors.length + ' erros' : 'Ficha pronta'].filter(Boolean).join(' · ')) + '</small>' +
          reminders.map(note => '<small>' + esc(note) + '</small>').join('') +
          '</div><div><div class="form-actions"><a class="button secondary" href="' + draftUrl(draft) +
          '">Editar</a><a class="button secondary" href="' + previewUrl(draft) + '">Prévia da ficha</a></div>' +
          (lot ? lotDraftActions(draft, lot) : '') + '</div></li>';
      }).join('') + '</ul>';
    }

    function showDrafts() {
      const drafts = work.drafts.filter(draft => !draft.lotId);
      frame('Rascunhos', link('adicionar', 'Adicionar carro') + ' ' +
        (drafts.length ? '<label class="price-option draft-filter"><input type="checkbox" id="photo-filter"> Falta foto do showroom</label>' : '') +
        draftList(drafts) + '<p id="no-drafts" hidden>Nenhum rascunho com foto pendente.</p>');
      const filter = main.querySelector('#photo-filter');
      if (filter) filter.onchange = () => {
        const rows = [...main.querySelectorAll('.draft-list li')];
        rows.forEach(row => { row.hidden = filter.checked && row.dataset.hasPhotoPending !== 'true'; });
        main.querySelector('#no-drafts').hidden = rows.some(row => !row.hidden);
      };
    }

    function readLotName(form, currentId) {
      const name = new FormData(form).get('nome').trim();
      if (!name) throw new Error('Informe o nome do lote.');
      if (work.lots.some(item => item.id !== currentId && D.normalize(item.name) === D.normalize(name))) {
        throw new Error('Já existe um lote com esse nome.');
      }
      return name;
    }

    async function changeLot(makeUpdate, after) {
      if (busy) return;
      busy = true;
      try {
        await update(makeUpdate());
        after();
      } catch (error) { tell(error.message); }
      finally { busy = false; }
    }

    function moveDraft(draft, destination) {
      const target = destination && work.lots.find(item => item.id === destination && item.id !== draft.lotId);
      if (destination && !target) { tell('Escolha outro lote para mover a ficha.'); return; }
      return changeLot(() => ({ ...work, drafts: work.drafts.map(item =>
        item.car.id === draft.car.id ? { ...item, lotId: destination, updated: newId() } : item) }), () => {
        render();
        tell(draftName(draft) + (target ? ' movido para o lote ' + target.name + '.' : ' movido para Rascunhos.'));
      });
    }

    function lotSettings(lot, draftCount) {
      return '<details class="token-panel"><summary>Editar lote</summary>' +
        '<form id="rename-lot" class="admin-bar"><label>Nome do lote<input name="nome" maxlength="90" value="' +
        esc(lot.name) + '" required></label><button type="submit">Salvar nome</button></form></details>' +
        '<details class="token-panel"><summary>Excluir lote</summary><p>' +
        (draftCount ? 'As fichas deste lote voltarão para Rascunhos com fotos e pendências.' : 'Este lote está vazio.') +
        '</p><button type="button" id="delete-lot" class="secondary">Confirmar exclusão do lote</button></details>';
    }

    function showLots() {
      const lot = work.lots.find(item => item.id === id);
      if (id && !lot) {
        frame('Lote indisponível', link('lotes', 'Voltar a Lotes'));
        return;
      }
      if (!lot) {
        frame('Lotes', '<form id="create-lot" class="admin-bar"><label>Nome do lote<input name="nome" maxlength="90" ' +
          'placeholder="Ex.: Dia 2" required></label><button type="submit">Criar lote</button></form><ul class="admin-list">' +
          work.lots.map(item => {
            const drafts = work.drafts.filter(draft => draft.lotId === item.id);
            return '<li><span><strong>' + esc(item.name) + '</strong><small>' + drafts.length +
              ' carros · ' + summaryText(drafts) + '</small></span>' +
              link('lotes', 'Abrir lote', 'button secondary', item.id) + '</li>';
          }).join('') + '</ul>');
        main.querySelector('#create-lot').onsubmit = event => {
          event.preventDefault();
          const form = event.currentTarget;
          const item = { id: newId() };
          return changeLot(() => {
            item.name = readLotName(form);
            const drafts = work.drafts.map(draft => draft.car.id === draftForNewLot ?
              { ...draft, lotId: item.id, updated: newId() } : draft);
            return { ...work, lots: [...work.lots, item], drafts };
          }, () => go(lotUrl(item.id)));
        };
        return;
      }
      const drafts = work.drafts.filter(draft => draft.lotId === lot.id);
      const loose = work.drafts.filter(draft => !draft.lotId);
      const totals = summary(drafts);
      frame(esc(lot.name), '<p>' + (drafts.length - totals.edited) + ' novos · ' + totals.edited + ' editados · ' +
        summaryText(drafts) + '</p><div class="form-actions">' +
        '<a class="button secondary" href="' + url('adicionar') + '?lote=' + lot.id + '">Novo carro neste lote</a>' +
        '<button type="button" id="publish-lot"' + (!drafts.length || totals.errors ? ' disabled' : '') + '>Publicar lote</button>' +
        '</div>' + (loose.length ? '<form id="add-draft" class="admin-bar token-panel"><label>Rascunho<select name="draft" required>' +
          loose.map(draft => '<option value="' + draft.car.id + '">' + esc(draftName(draft)) + '</option>').join('') +
          '</select></label><button type="submit" class="secondary">Adicionar ao lote</button></form>' : '') +
        draftList(drafts, lot) + lotSettings(lot, drafts.length));
      const add = main.querySelector('#add-draft');
      if (add) add.onsubmit = event => {
        event.preventDefault();
        const choice = new FormData(add).get('draft');
        const draft = loose.find(item => item.car.id === choice);
        if (draft) return moveDraft(draft, lot.id);
      };
      main.querySelectorAll('[data-lot-draft]').forEach(form => {
        const draft = drafts.find(item => item.car.id === form.dataset.lotDraft);
        form.onsubmit = event => {
          event.preventDefault();
          const destination = new FormData(form).get('destino');
          if (destination) return moveDraft(draft, destination);
        };
        form.querySelector('[data-unassign]').onclick = () => moveDraft(draft, '');
      });
      main.querySelector('#rename-lot').onsubmit = event => {
        event.preventDefault();
        const form = event.currentTarget;
        return changeLot(() => {
          const name = readLotName(form, lot.id);
          return { ...work, lots: work.lots.map(item => item.id === lot.id ? { ...item, name } : item) };
        }, () => { render(); tell('Nome do lote atualizado.'); });
      };
      main.querySelector('#delete-lot').onclick = () => changeLot(() => ({
        ...work,
        lots: work.lots.filter(item => item.id !== lot.id),
        drafts: work.drafts.map(draft => draft.lotId === lot.id ? { ...draft, lotId: '', updated: newId() } : draft)
      }), () => go(url('lotes')));
      main.querySelector('#publish-lot').onclick = () => publish(drafts, lot);
    }

    function renderForm() {
      const wantsDraft = params.has('rascunho');
      const stored = id && work.drafts.find(draft => draft.car.id === id);
      const original = stored ? stored.original : catalog.cars.find(car => car.id === id) || null;
      if (page === 'editar' && (!stored && wantsDraft || !stored && !original)) {
        frame('Ficha indisponível', link('gerenciar', 'Voltar a Carros'));
        return;
      }
      const current = stored?.car || original || { id: newId(), criado: new Date().toISOString() };
      const selected = stored?.lotId || selectedLotId || '';
      const pending = stored?.notes || [];
      const availableLots = work.lots.map(lot => '<option value="' + lot.id + '"' +
        (selected === lot.id ? ' selected' : '') + '>' + esc(lot.name) + '</option>').join('');
      const previousPhoto = stored?.photo || current.foto;
      const field = ([key, label, type = 'text', min, max, step]) => {
        const value = key === 'tempo' ? stored?.lapInput || (current.tempo && D.lap(current.tempo)) || '' : current[key] ?? '';
        const input = '<label>' + label + '<input name="' + key + '" type="' + type + '" value="' + esc(value) + '"' +
          (type === 'number' ? ' min="' + min + '" max="' + max + '" step="' + step + '"' :
            key === 'tempo' ? ' placeholder="1:25.553"' : ' maxlength="120"') + '></label>';
        if (!['potencia', 'torque', 'peso'].includes(key)) return input;
        return '<div class="source-field">' + input + '<label>Fonte de ' + label.toLowerCase() + '<select name="fonte-' + key +
          '"><option value="">Sem indicação</option>' + Object.entries(D.sourceLabels).map(([source, name]) =>
            '<option value="' + source + '"' + (current.fontes?.[key] === source ? ' selected' : '') +
            '>' + name + '</option>').join('') + '</select></label></div>';
      };
      const category = '<label>Categoria<select name="categoria"><option value="">Selecione</option>' +
        Object.entries(D.categories).map(([key, label]) => '<option value="' + key + '"' +
          (current.categoria === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>';
      const price = '<div class="price-field"><label>Valor de referência (US$)<input name="valor" type="number" min=".01" ' +
        'max="999999999" step=".01" value="' + (hasPrice(current.valor) ? current.valor : '') + '"></label>' +
        '<label class="price-option"><input name="semValor" type="checkbox"' +
        (current.valor === null ? ' checked' : '') + '> Sem valor estimado</label></div>';
      frame(original ? 'Editar carro' : stored ? 'Editar rascunho' : 'Adicionar carro',
        '<form id="car-form" class="form-page" novalidate><h2>Dados da volta</h2><div class="form-grid">' +
        [fields[0], fields[1], fields[3], fields[9], fields[10]].map(field).join('') + '</div>' +
        '<h2>Ficha técnica</h2><div class="form-grid">' +
        [fields[2], ...fields.slice(4, 9)].map(field).join('') + category + price + '</div>' +
        '<h2>História do carro</h2><label>História do carro (opcional)<textarea name="historia" rows="5" maxlength="12000">' +
        esc(current.historia) + '</textarea></label><h2>Foto do showroom</h2><label>Arquivo JPG, PNG ou WebP' +
        '<input name="foto" type="file" accept="' + fileTypes.join(',') + '"></label>' +
        (previousPhoto ? '<div class="form-photo">' + photo({ ...current, foto: previousPhoto }) + '</div>' : '') +
        '<h2>Pendências</h2><label class="price-option"><input type="checkbox" name="faltaFoto"' +
        (pending.includes(imageReminder) || !previousPhoto ? ' checked' : '') + '> Falta foto do showroom</label>' +
        '<label>Outro lembrete<input name="lembrete" maxlength="150" value="' + esc(pending.find(note => note !== imageReminder)) +
        '"></label><h2>Salvar ficha</h2>' + (availableLots ? '<label>Lote<select name="lote">' +
          '<option value="">Escolha um lote</option>' + availableLots + '</select></label>' : '') +
        '<div class="form-actions"><button type="submit" value="publish">Publicar agora</button>' +
        '<button type="submit" value="draft" class="secondary">Salvar como rascunho</button>' +
        '<button type="submit" value="preview" class="secondary">Prévia da ficha</button>' +
        (availableLots ? '<button type="submit" value="lot" class="secondary">Adicionar a um lote</button>' :
          '<button type="submit" value="new-lot" class="secondary">Criar lote</button>') + '</div></form>' + (original && !wantsDraft ?
          '<details class="token-panel"><summary>Excluir carro</summary><p>A ficha sai da Garagem e os recordes são recalculados.</p>' +
          '<button type="button" id="remove-car">Confirmar exclusão</button></details>' : '') +
        (stored ? '<details class="token-panel"><summary>Descartar rascunho</summary><p>Remove a cópia salva no navegador.</p>' +
          '<button type="button" class="secondary" id="discard">Confirmar descarte</button></details>' : ''));
      const form = main.querySelector('#car-form');
      const noPrice = form.elements.semValor;
      const fileField = form.elements.foto;
      noPrice.oninput = () => { form.elements.valor.disabled = noPrice.checked; };
      noPrice.oninput();
      fileField.onchange = () => { if (fileField.files.length) form.elements.faltaFoto.checked = false; };
      const discard = main.querySelector('#discard');
      if (discard) discard.onclick = async () => {
        if (busy) return;
        busy = true;
        try {
          await update({ ...work, drafts: work.drafts.filter(draft => draft.car.id !== current.id) });
          go(stored.lotId ? lotUrl(stored.lotId) : url('rascunhos'));
        } catch (error) { tell(error.message); }
        finally { busy = false; }
      };
      const remove = main.querySelector('#remove-car');
      if (remove) remove.onclick = () => publish([], null, original);
      form.onsubmit = async event => {
        event.preventDefault();
        if (busy) return;
        const action = event.submitter?.value || 'draft';
        const data = new FormData(form);
        const lotId = data.get('lote') || '';
        if (action === 'lot' && !lotId) { tell('Escolha um lote antes de salvar.'); return; }
        const controls = [...form.querySelectorAll('button')];
        controls.forEach(button => { button.disabled = true; });
        busy = true;
        try {
          const car = { ...current };
          let lapInput;
          for (const [key, , type] of fields) {
            const value = data.get(key).trim();
            if (key === 'tempo') {
              car[key] = D.parseLap(value) || undefined;
              if (value && !car[key]) lapInput = value;
            } else car[key] = type === 'number' ? (value === '' ? undefined : Number(value)) : value;
          }
          car.categoria = data.get('categoria');
          car.valor = data.has('semValor') ? null : (data.get('valor') ? Number(data.get('valor')) : undefined);
          car.historia = data.get('historia').trim();
          car.fontes = Object.fromEntries(['potencia', 'torque', 'peso'].map(key => [key, data.get('fonte-' + key)]).filter(([, value]) => value));
          const file = fileField.files[0];
          const image = file ? await loadPhoto(file) : stored?.photo;
          const notes = [data.has('faltaFoto') && imageReminder, data.get('lembrete').trim()].filter(Boolean);
          const draft = { car, original, photo: image, notes, lapInput, lotId: action === 'draft' ? '' : (lotId || stored?.lotId || '') };
          const changed = (value) => JSON.stringify({ ...value, updated: undefined });
          draft.updated = stored && changed(stored) === changed(draft) ? stored.updated : newId();
          const drafts = stored ? work.drafts.map(item => item.car.id === car.id ? draft : item) : [...work.drafts, draft];
          await update({ ...work, drafts });
          if (action === 'publish') {
            const { errors } = problems(draft);
            if (errors.length) {
              main.querySelector('#issues').outerHTML = issues();
              main.querySelector('#issues').open = true;
              tell('A ficha foi salva como rascunho. Corrija os erros antes de publicar.');
              return;
            }
            busy = false;
            await publish([draft]);
          } else if (action === 'preview') go(previewUrl(draft));
          else if (action === 'lot') go(lotUrl(lotId));
          else if (action === 'new-lot') go(url('lotes') + '?rascunho=' + encodeURIComponent(car.id));
          else go(url('rascunhos'));
        } catch (error) { tell(error.message); }
        finally {
          busy = false;
          controls.forEach(button => { button.disabled = false; });
        }
      };
    }

    function showPreview() {
      const draft = work.drafts.find(item => item.car.id === id);
      frame('Prévia da ficha', draft ? '<div class="form-actions"><a class="button secondary" href="' + draftUrl(draft) +
        '">Voltar à edição</a>' + (draft.lotId ? link('lotes', 'Voltar ao lote', 'button secondary', draft.lotId) :
        link('rascunhos', 'Voltar a Rascunhos', 'button secondary')) + '</div>' :
        empty('Rascunho indisponível.'), { panels: false });
      if (!draft) return;
      const group = draft.lotId ? work.drafts.filter(item => item.lotId === draft.lotId) : [draft];
      const ids = new Set(group.map(item => item.car.id));
      const pool = [...catalog.cars.filter(car => !ids.has(car.id)), ...group.map(item => item.car)];
      main.insertAdjacentHTML('beforeend', detailMarkup({ ...draft.car, foto: draft.photo || draft.car.foto }, pool, true));
    }

    async function publish(drafts, lot, deletion) {
      if (busy || (!deletion && (!drafts.length || summary(drafts).errors))) return;
      const title = deletion ? 'Excluir ' + D.name(deletion) : lot ? 'Lote: ' + lot.name : draftName(drafts[0]);
      const key = deletion ? 'excluir:' + deletion.id : lot ? 'lote:' + lot.id : 'ficha:' + drafts[0].car.id;
      const signature = deletion ? JSON.stringify(deletion) : drafts.map(draft => draft.updated).sort().join(',');
      const prior = work.pending[key];
      const publication = prior?.signature === signature ? prior.id : newId();
      const controls = [...main.querySelectorAll('button, input, select, textarea')].map(control => [control, control.disabled]);
      controls.forEach(([control]) => { control.disabled = true; });
      busy = true;
      tell(local ? 'Aplicando publicação de teste…' : 'Publicando no GitHub…');
      try {
        if (publication !== prior?.id) {
          const record = { id: publication, signature, title, lotId: lot?.id,
            drafts: drafts.map(draft => [draft.car.id, draft.updated]), deleted: deletion?.id };
          await update({ ...work, pending: { ...work.pending, [key]: record } });
        }
        let result;
        if (local) {
          const current = await D.load('preview') || catalog;
          const next = current.publications?.includes(publication) ? current : deletion ?
            D.removeWithPublication(current, deletion, publication) : D.applyBatch(current, drafts, publication, true);
          await D.save('preview', next);
          result = { catalog: next };
        } else {
          result = deletion ? await D.publishRemoval(access.token, access.branch, deletion, publication) :
            await D.publishBatch(access.token, access.branch, drafts, publication, title);
        }
        catalog = result.catalog;
        const completed = new Set(drafts.map(draft => draft.car.id));
        if (deletion) completed.add(deletion.id);
        const pending = { ...work.pending };
        delete pending[key];
        await update({ ...work, pending, drafts: work.drafts.filter(draft => !completed.has(draft.car.id)),
          lots: work.lots.filter(item => item.id !== lot?.id),
          receipts: [{ id: publication, title, sha: result.sha, visible: local }, ...work.receipts].slice(0, 25) });
        go(url('gerenciar'));
      } catch (error) {
        tell(error.message);
        controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      } finally { busy = false; }
    }

    function render() {
      ({ gerenciar: showCars, rascunhos: showDrafts, lotes: showLots,
        adicionar: renderForm, editar: renderForm, previa: showPreview })[page]();
    }

    if (!access || Boolean(access.local) !== local) { signIn(); return; }
    if (!local) {
      try {
        catalog = await D.readRemote(access.token, access.branch);
      } catch (error) {
        if (/inválido|expirado|recusou a permissão/.test(error.message)) {
          saveAccess(null);
          signIn();
          tell(error.message);
          return;
        }
        render();
        tell('O GitHub está indisponível. Você pode continuar com os rascunhos. ' + error.message);
        return;
      }
    }
    for (const [key, item] of Object.entries(work.pending)) {
      if (!catalog.publications?.includes(item.id)) continue;
      const pending = { ...work.pending };
      delete pending[key];
      const drafts = work.drafts.filter(draft => !(item.drafts || []).some(([id, revision]) =>
        id === draft.car.id && revision === draft.updated) && item.deleted !== draft.car.id);
      try {
        await update({ ...work, pending, drafts,
          lots: work.lots.filter(lot => lot.id !== item.lotId || drafts.some(draft => draft.lotId === lot.id)),
          receipts: [{ id: item.id, title: item.title, visible: local }, ...work.receipts].slice(0, 25) });
      } catch { break; }
    }
    render();
    if (!local && work.receipts.some(item => !item.visible)) {
      let checks = 0;
      checkSite();
      receiptTimer = setInterval(() => {
        if (++checks >= 25 || !work.receipts.some(item => !item.visible)) clearInterval(receiptTimer);
        else checkSite();
      }, 8000);
    }
  };
})();
