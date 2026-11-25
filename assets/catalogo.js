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
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const key = 'prestes-racing-v1-catalogo-local';
  const remote = 'carloshrpp/prestes-racing';
  const dataPath = 'data/carros.js';
  const prefix = 'window.PRESTES_CATALOGO = ';

  const ordered = (cars, order = 'tempo') => [...cars].sort(
    (a, b) => orders[order][1](a, b) || a.tempo - b.tempo || a.id.localeCompare(b.id)
  );
  const position = (cars, car) => 1 + cars.filter(other => other.tempo < car.tempo).length;
  const latest = cars => [...cars].sort((a, b) => b.episodio - a.episodio || b.criado.localeCompare(a.criado));
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const name = car => car.marca + ' ' + car.modelo;
  const lap = milliseconds => {
    const seconds = String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0');
    return Math.floor(milliseconds / 60000) + ':' + seconds + '.' + String(milliseconds % 1000).padStart(3, '0');
  };
  const parseLap = value => {
    const parts = /^(\d{1,2}):([0-5]\d)[.,](\d{3})$/.exec(value.trim());
    return parts ? Number(parts[1]) * 60000 + Number(parts[2]) * 1000 + Number(parts[3]) : 0;
  };
  const readDraft = () => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  };
  const saveDraft = catalog => localStorage.setItem(key, JSON.stringify(catalog));
  const preview = () => location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
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

  function decodeCatalog(base64) {
    const data = new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0))).trim();
    if (!data.startsWith(prefix) || !data.endsWith(';')) throw new Error('O catálogo no GitHub tem um formato inválido.');
    const catalog = JSON.parse(data.slice(prefix.length, -1));
    if (catalog.version !== 1 || !Array.isArray(catalog.cars)) throw new Error('O catálogo no GitHub tem uma versão incompatível.');
    return catalog;
  }

  function upsert(catalog, car, original) {
    const index = catalog.cars.findIndex(item => item.id === car.id);
    if (original && (index === -1 || JSON.stringify(catalog.cars[index]) !== JSON.stringify(original))) {
      throw new Error('A ficha mudou desde que foi aberta. Reabra a ficha atual antes de publicar.');
    }
    if (!original && index !== -1) throw new Error('Já existe uma ficha com este identificador.');
    const repeated = catalog.cars.some(item => item.id !== car.id &&
      normalize(name(item)) === normalize(name(car)) && item.ano === car.ano);
    if (repeated) throw new Error('Já existe uma ficha para esse carro e ano.');
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

  async function commitCatalog(token, branch, message, change) {
    const refPath = '/git/ref/heads/' + branch.split('/').map(encodeURIComponent).join('/');
    const ref = await github(refPath, token);
    const head = ref.object.sha;
    const [parent, file] = await Promise.all([
      github('/git/commits/' + head, token),
      github('/contents/' + dataPath + '?ref=' + head, token)
    ]);
    const { catalog, entries = [] } = await change(decodeCatalog(file.content));
    entries.push({ path: dataPath, mode: '100644', type: 'blob', content: prefix + JSON.stringify(catalog) + ';\n' });
    const tree = await github('/git/trees', token, 'POST', { base_tree: parent.tree.sha, tree: entries });
    const commit = await github('/git/commits', token, 'POST', { message, tree: tree.sha, parents: [head] });
    await github(refPath.replace('/git/ref/', '/git/refs/'), token, 'PATCH', { sha: commit.sha, force: false });
    return commit.sha;
  }

  function publish(token, branch, car, original, newPhoto) {
    const message = 'Prestes Racing: ' + (original ? 'atualizar ' : 'cadastrar ') + name(car);
    return commitCatalog(token, branch, message, async current => {
      const catalog = upsert(current, car, original);
      const entries = [];
      if (newPhoto) {
        const photo = await github('/git/blobs', token, 'POST', { content: newPhoto.split(',')[1], encoding: 'base64' });
        entries.push({ path: car.foto, mode: '100644', type: 'blob', sha: photo.sha });
        if (original?.foto && original.foto !== car.foto && original.foto.startsWith('assets/carros/' + car.id + '.')) {
          entries.push({ path: original.foto, mode: '100644', type: 'blob', sha: null });
        }
      }
      return { catalog, entries };
    });
  }

  function publishRemoval(token, branch, original) {
    return commitCatalog(token, branch, 'Prestes Racing: excluir ' + name(original),
      current => ({ catalog: remove(current, original) }));
  }

  window.PrestesData = { categories, orders, decimal, currency, name, lap, parseLap, ordered, position, latest,
    normalize, readDraft, saveDraft, preview, validateToken, publish, publishRemoval, upsert, remove, remote };
})();
