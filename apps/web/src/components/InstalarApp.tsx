// Botão "Instalar app": usa o convite do navegador quando existe; no iPhone/iPad mostra o caminho
// (Compartilhar → Adicionar à Tela de Início). Some quando o app já está instalado.
import { useState } from 'react';
import { useInstalarApp } from '@/lib/pwa';
import { Icon } from './icons';
import { Modal } from './ui';

export function InstalarApp({ compacto = false }: { compacto?: boolean }) {
  const app = useInstalarApp(); const [ajuda, setAjuda] = useState(false);
  if (app.modo === 'nenhum') return null;
  const clicar = () => (app.modo === 'convite' ? void app.instalar() : setAjuda(true));
  return <>
    <button className={`btn ${compacto ? 'icon ghost' : ''}`} onClick={clicar} aria-label="Instalar app" title="Instalar o sistema como app"><Icon name="download" size={16} />{!compacto && <span className="hide-sm">Instalar app</span>}</button>
    <Modal title="Instalar no iPhone ou iPad" open={ajuda} onClose={() => setAjuda(false)}>
      <ol className="stack" style={{ gap: 10, paddingLeft: 18, margin: 0 }}>
        <li>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
        <li>Role e toque em <b>Adicionar à Tela de Início</b>.</li>
        <li>Confirme em <b>Adicionar</b>. O ícone do sistema aparece junto dos seus apps e abre em tela cheia.</li>
      </ol>
    </Modal>
  </>;
}
