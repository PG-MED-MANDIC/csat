// Tela de senha + decifragem dos dados no navegador (Web Crypto API).
// Par de pipeline/protecao.py: o repositório público só tem o arquivo
// cifrado; sem a senha certa não há como ler os dados, nem pelo código-fonte.
//
// Protecao.iniciar({
//   arquivo: 'data.enc',          // pacote gerado por protecao.py
//   modo: 'script' | 'pagina',    // 'script': executa o texto decifrado como JS
//                                 // 'pagina': substitui o documento inteiro
//   depois: ['app.js'],           // (modo script) scripts carregados em seguida
//   titulo: 'CSAT Pós Med',
//   chaveSessao: 'csat_chave_v1', // guarda a chave derivada só nesta aba
// })
(function () {
  function b64ParaBytes(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesParaB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function derivar(senha, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }

  async function decifrar(pacote, chave) {
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ParaBytes(pacote.iv) }, chave, b64ParaBytes(pacote.ct));
    return new TextDecoder().decode(plano);
  }

  function lerSessao(nome) {
    try { return JSON.parse(sessionStorage.getItem(nome) || 'null'); } catch (e) { return null; }
  }
  function gravarSessao(nome, valor) {
    try { sessionStorage.setItem(nome, JSON.stringify(valor)); } catch (e) { /* aba privada: só pede a senha de novo */ }
  }

  function montarTela(titulo) {
    const el = document.createElement('div');
    el.id = 'pw-gate';
    el.style.cssText = 'position:fixed;inset:0;background:#f4f6fa;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;';
    el.innerHTML =
      '<div style="background:#fff;padding:32px 28px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.08);width:320px;max-width:calc(100% - 32px);text-align:center">' +
      '<div data-titulo style="font-size:18px;font-weight:800;color:#1A2459;margin-bottom:18px"></div>' +
      '<input type="password" placeholder="Senha de acesso" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;margin-bottom:10px">' +
      '<button style="width:100%;padding:10px;background:#01559B;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">Entrar</button>' +
      '<div data-msg style="display:none;color:#dc2626;font-size:12px;margin-top:10px"></div>' +
      '<div style="font-size:10px;color:#9ca3af;margin-top:16px">Acesso restrito à coordenação médica — uso interno.</div>' +
      '</div>';
    el.querySelector('[data-titulo]').textContent = titulo || 'Acesso restrito';
    document.body.appendChild(el);
    return el;
  }

  function carregarScripts(lista) {
    return lista.reduce((p, src) => p.then(() => new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => erro(new Error('Falha ao carregar ' + src));
      document.body.appendChild(s);
    })), Promise.resolve());
  }

  async function abrir(texto, opts) {
    if (opts.modo === 'pagina') {
      document.open();
      document.write(texto);
      document.close();
      return;
    }
    const s = document.createElement('script');
    s.text = texto;
    document.body.appendChild(s);
    await carregarScripts(opts.depois || []);
  }

  async function iniciar(opts) {
    const resp = await fetch(opts.arquivo, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('Não foi possível baixar ' + opts.arquivo);
    const pacote = await resp.json();
    const salt = b64ParaBytes(pacote.salt);

    // Mesma aba, mesmo arquivo: reaproveita a chave sem pedir a senha de novo.
    // O salt muda a cada publicação, então a chave guardada expira sozinha.
    const sessao = lerSessao(opts.chaveSessao);
    if (sessao && sessao.salt === pacote.salt) {
      try {
        const chave = await crypto.subtle.importKey('raw', b64ParaBytes(sessao.k), 'AES-GCM', false, ['decrypt']);
        const texto = await decifrar(pacote, chave);
        return abrir(texto, opts);
      } catch (e) { /* chave velha/inválida: cai na tela de senha */ }
    }

    const tela = montarTela(opts.titulo);
    const input = tela.querySelector('input');
    const botao = tela.querySelector('button');
    const msg = tela.querySelector('[data-msg]');
    input.focus();

    async function tentar() {
      msg.style.display = 'none';
      botao.disabled = true;
      botao.textContent = 'Verificando…';
      let chave, texto;
      try {
        chave = await derivar(input.value, salt, pacote.iter);
        texto = await decifrar(pacote, chave);
      } catch (e) {
        msg.textContent = 'Senha incorreta.';
        msg.style.display = 'block';
        botao.disabled = false;
        botao.textContent = 'Entrar';
        input.select();
        return;
      }
      const bruto = new Uint8Array(await crypto.subtle.exportKey('raw', chave));
      gravarSessao(opts.chaveSessao, { salt: pacote.salt, k: bytesParaB64(bruto) });
      await abrir(texto, opts);
      tela.remove();
    }
    const falhar = e => { console.error(e); msg.textContent = 'Erro ao abrir o dashboard. Recarregue a página.'; msg.style.display = 'block'; };
    botao.addEventListener('click', () => tentar().catch(falhar));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tentar().catch(falhar); });
  }

  window.Protecao = {
    iniciar(opts) {
      iniciar(opts).catch(e => {
        document.body.insertAdjacentHTML('beforeend',
          '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#f4f6fa;font-family:Segoe UI,Arial,sans-serif;color:#dc2626;z-index:99999">' +
          'Erro ao carregar o dashboard. Recarregue a página.</div>');
        console.error(e);
      });
    },
  };
})();
