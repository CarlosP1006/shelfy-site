{
  const raiz = document.documentElement;
  const chave = 'shelfy:tema';
  const sistema = matchMedia('(prefers-color-scheme: dark)');
  try {
    const salvo = localStorage.getItem(chave);
    if (salvo === 'claro' || salvo === 'escuro') raiz.dataset.tema = salvo;
  } catch {}
  const escuro = () => (raiz.dataset.tema ? raiz.dataset.tema === 'escuro' : sistema.matches);

  document.addEventListener('DOMContentLoaded', () => {
    const botao = document.querySelector('[data-botao-tema]');
    if (!botao) return;
    const marcar = () => botao.setAttribute('aria-pressed', escuro());
    const trocar = () => {
      raiz.dataset.tema = escuro() ? 'claro' : 'escuro';
      try {
        localStorage.setItem(chave, raiz.dataset.tema);
      } catch {}
      marcar();
    };
    marcar();
    sistema.addEventListener('change', marcar);
    botao.addEventListener('click', () => (document.startViewTransition ? document.startViewTransition(trocar) : trocar()));
    botao.hidden = false;
  });
}
