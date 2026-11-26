(() => {
  'use strict';

  const categories = {
    corrida: 'Carros de Corrida', preparados: 'Preparados', especiais: 'Especiais',
    esportivos: 'Esportivos', supercarros: 'Supercarros', classicos: 'Clássicos',
    compactos: 'Compactos', sedas: 'Sedãs', peruas: 'Peruas', suvs: 'SUVs', picapes: 'Picapes'
  };
  const orders = {
    tempo: ['Melhor volta', (a, b) => a.tempo - b.tempo],
    potencia: ['Maior potência', (a, b) => b.potencia - a.potencia],
    velocidade: ['Maior velocidade na pista', (a, b) => b.velocidade - a.velocidade],
    peso: ['Menor peso', (a, b) => a.peso - b.peso]
  };
  const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
  const remote = 'carloshrpp/prestes-racing';
  const dataPath = 'data/carros.js';
  const prefix = 'window.PRESTES_CATALOGO = ';

  const ordered = (cars, order = 'tempo') => [...cars].sort(
    (a, b) => orders[order][1](a, b) || a.tempo - b.tempo || a.id.localeCompare(b.id)
  );
  const position = (cars, car) => 1 + cars.filter(other => other.tempo < car.tempo).length;
  const latest = cars => [...cars].sort((a, b) => b.episodio - a.episodio || b.criado.localeCompare(a.criado));
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const name = car => [car.marca, car.modelo].filter(Boolean).join(' ');
  const lap = milliseconds => {
    const seconds = String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0');
    return Math.floor(milliseconds / 60000) + ':' + seconds + '.' + String(milliseconds % 1000).padStart(3, '0');
  };
  const parseLap = value => {
    const parts = /^(\d{1,2}):([0-5]\d)[.,](\d{3})$/.exec(value.trim());
    return parts ? Number(parts[1]) * 60000 + Number(parts[2]) * 1000 + Number(parts[3]) : 0;
  };
  const preview = () => location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const sourceLabels = { mod: 'Mod do Assetto Corsa', oficial: 'Ficha oficial' };
  const metrics = ['tempo', 'velocidade', 'potencia', 'valor'];
  const holders = (cars, metric) => {
    const eligible = cars.filter(car => Number.isFinite(car[metric]) && car[metric] > 0);
    if (!eligible.length) return [];
    const best = metric === 'tempo' ? Math.min(...eligible.map(car => car[metric])) :
      Math.max(...eligible.map(car => car[metric]));
    return ordered(eligible.filter(car => car[metric] === best));
  };

  let database;
  function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('prestes-racing-v2:' + new URL('../', document.currentScript?.src ||
        new URL(document.body.dataset.root + 'assets/catalogo.js', location.href)).pathname, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('O navegador não abriu o armazenamento local.'));
    });
    return database;
  }

  async function load(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction('state').objectStore('state').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Não foi possível ler os rascunhos locais.'));
    });
  }

  async function save(key, value, expected) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const store = tx.objectStore('state');
      let failure = 'Não foi possível salvar no navegador. Verifique o espaço disponível.';
      tx.oncomplete = resolve;
      tx.onabort = () => reject(new Error(failure));
      if (expected === undefined) {
        store.put(value, key);
        return;
      }
      const request = store.get(key);
      request.onsuccess = () => {
        if ((request.result?.revision || 0) !== expected) {
          failure = 'Os rascunhos mudaram em outra aba. Atualize esta página antes de salvar.';
          tx.abort();
        } else store.put(value, key);
      };
    });
  }
  const repoUrl = 'https://api.github.com/repos/' + remote;

  async function github(path, token, method = 'GET', body) {
    const response = await fetch(repoUrl + path, {
      method,
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28', ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
      cache: 'no-store'
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const explanations = { 401: 'Token inválido ou expirado.', 403: 'O GitHub recusou a permissão solicitada.',
        404: 'Repositório ou arquivo não encontrado. Confira o acesso do token e a configuração do repositório.',
        409: 'O repositório está vazio ou recebeu alterações. Confira o repositório e tente novamente.',
        422: 'O GitHub recusou a atualização. Confira a branch e tente novamente.' };
      throw new Error(explanations[response.status] || error.message || 'O GitHub retornou o erro ' + response.status + '.');
    }
    return response.json();
  }

  async function validateToken(token) {
    const repository = await github('', token);
    // Creating an unreferenced, empty Git object verifies write access without a commit.
    await github('/git/blobs', token, 'POST', { content: '', encoding: 'base64' });
    return repository.default_branch;
  }

  function parseCatalog(raw) {
    const data = raw.trim();
    if (!data.startsWith(prefix) || !data.endsWith(';')) throw new Error('O catálogo no GitHub tem um formato inválido.');
    const catalog = JSON.parse(data.slice(prefix.length, -1));
    if (catalog.version !== 1 || !Array.isArray(catalog.cars)) throw new Error('O catálogo no GitHub tem uma versão incompatível.');
    return catalog;
  }

  function decodeCatalog(base64) {
    return parseCatalog(new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0))));
  }

  async function readRemote(token, ref) {
    const file = await github('/contents/' + dataPath + '?ref=' + encodeURIComponent(ref), token);
    const blob = file.content ? file : await github('/git/blobs/' + file.sha, token);
    return decodeCatalog(blob.content);
  }

  function upsert(catalog, car, original) {
    const index = catalog.cars.findIndex(item => item.id === car.id);
    if (original && (index === -1 || JSON.stringify(catalog.cars[index]) !== JSON.stringify(original))) {
      throw new Error('A ficha de ' + name(car) + ' mudou no GitHub desde que foi aberta.');
    }
    if (!original && index !== -1) throw new Error('Já existe uma ficha com este identificador.');
    const repeated = catalog.cars.some(item => item.id !== car.id &&
      normalize(name(item)) === normalize(name(car)) && item.ano === car.ano);
    if (repeated) throw new Error('Já existe uma ficha para ' + name(car) + ' desse ano.');
    if (catalog.cars.some(item => item.id !== car.id && item.episodio === car.episodio)) {
      throw new Error('O número da Volta Rápida ' + car.episodio + ' já está em uso.');
    }
    const cars = [...catalog.cars];
    if (index === -1) cars.push(car);
    else cars[index] = car;
    return { ...catalog, cars };
  }

  function remove(catalog, original) {
    const current = catalog.cars.find(item => item.id === original.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(original)) {
      throw new Error('A ficha mudou ou já foi excluída. Recarregue o Gerenciar.');
    }
    return { ...catalog, cars: catalog.cars.filter(item => item.id !== original.id) };
  }

  function recordChanges(before, after, car) {
    const scopes = [...metrics.map(metric => [metric, null]), ['tempo', car.categoria]];
    return scopes.flatMap(([metric, category]) => {
      const inScope = items => category ? items.filter(item => item.categoria === category) : items;
      const oldLeaders = holders(inScope(before.cars), metric);
      const leaders = holders(inScope(after.cars), metric);
      const old = oldLeaders[0]?.[metric];
      const best = leaders[0]?.[metric];
      const improved = old && best && (metric === 'tempo' ? best < old : best > old);
      if (!improved || !leaders.some(item => item.id === car.id)) return [];
      return [{
        metric, category, episodio: car.episodio,
        before: { names: oldLeaders.map(name), value: old },
        after: { names: leaders.map(name), value: best }
      }];
    });
  }

  function applyBatch(current, changes, publication, local = false) {
    let catalog = current;
    const history = [...(current.history || [])];
    // Validate every original against the same snapshot and resolve the final set before checking uniqueness.
    const remaining = changes.reduce((base, { original }) => original ? remove(base, original) : base, current);
    const prepared = changes.map(({ car, photo, original }) => ({
      original,
      car: {
        ...car,
        foto: photo ? (local ? photo : 'assets/carros/' + car.id + '.webp') : car.foto ?? null
      }
    }));
    const final = prepared.reduce((base, { car }) => upsert(base, car), remaining);
    const updates = new Map(prepared.map(({ car }) => [car.id, car]));
    const existing = new Set(current.cars.map(car => car.id));
    const originalOrder = current.cars.map(car => updates.get(car.id) || car);
    const additions = final.cars.filter(car => !existing.has(car.id));
    const orderedChanges = [...prepared].sort((a, b) => a.car.episodio - b.car.episodio);
    for (const { car } of orderedChanges) {
      const cars = catalog.cars.filter(item => item.id !== car.id).concat(car);
      const next = { ...catalog, cars };
      history.push(...recordChanges(catalog, next, car));
      catalog = next;
    }
    return { ...final, cars: [...originalOrder, ...additions], history, publications: [...(current.publications || []), publication].slice(-100) };
  }

  async function commitCatalog(token, branch, publication, message, change) {
    const refPath = '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/');
    const ref = await github(refPath, token);
    const head = ref.object.sha;
    const [parent, current] = await Promise.all([
      github('/git/commits/' + head, token),
      readRemote(token, head)
    ]);
    if (current.publications?.includes(publication)) return { sha: head, catalog: current };
    const { catalog, entries = [] } = await change(current);
    entries.push({ path: dataPath, mode: '100644', type: 'blob', content: prefix + JSON.stringify(catalog) + ';\n' });
    const tree = await github('/git/trees', token, 'POST', { base_tree: parent.tree.sha, tree: entries });
    const commit = await github('/git/commits', token, 'POST', { message, tree: tree.sha, parents: [head] });
    try {
      await github(refPath.replace('/git/ref/', '/git/refs/'), token, 'PATCH', { sha: commit.sha, force: false });
    } catch (error) {
      const published = await readRemote(token, branch).catch(() => null);
      if (!published?.publications?.includes(publication)) throw error;
      return { sha: commit.sha, catalog: published };
    }
    return { sha: commit.sha, catalog };
  }

  function publishBatch(token, branch, changes, publication, title) {
    return commitCatalog(token, branch, publication, 'Prestes Racing: ' + title, async current => {
      const catalog = applyBatch(current, changes, publication);
      const entries = [];
      for (const { car, photo, original } of changes) {
        if (!photo) continue;
        const path = 'assets/carros/' + car.id + '.webp';
        const blob = await github('/git/blobs', token, 'POST', { content: photo.split(',')[1], encoding: 'base64' });
        entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        if (original?.foto && original.foto !== path && original.foto.startsWith('assets/carros/' + car.id + '.')) {
          entries.push({ path: original.foto, mode: '100644', type: 'blob', sha: null });
        }
      }
      return { catalog, entries };
    });
  }

  function removeWithPublication(catalog, original, publication) {
    return { ...remove(catalog, original), publications: [...(catalog.publications || []), publication].slice(-100) };
  }

  function publishRemoval(token, branch, original, publication) {
    return commitCatalog(token, branch, publication, 'Prestes Racing: excluir ' + name(original),
      current => ({ catalog: removeWithPublication(current, original, publication) }));
  }

  window.PrestesData = { categories, orders, decimal, currency, name, lap, parseLap, ordered, position, latest,
    normalize, preview, validateToken, readRemote, parseCatalog, publishBatch, publishRemoval, applyBatch,
    removeWithPublication, holders, sourceLabels, load, save, remote };
})();
