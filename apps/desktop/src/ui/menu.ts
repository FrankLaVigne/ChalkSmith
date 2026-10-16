import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';

export interface MenuHandlers {
  open: () => void;
  save: () => void;
  saveAs: () => void;
  exportSvg: () => void;
  close: () => void;
  quit: () => void;
}

export async function installMenu(h: MenuHandlers): Promise<void> {
  const file = await Submenu.new({
    text: 'File',
    items: [
      await MenuItem.new({ id: 'open', text: 'Open…', accelerator: 'CmdOrCtrl+O', action: h.open }),
      await MenuItem.new({ id: 'save', text: 'Save', accelerator: 'CmdOrCtrl+S', action: h.save }),
      await MenuItem.new({ id: 'saveas', text: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', action: h.saveAs }),
      await MenuItem.new({ id: 'export', text: 'Export SVG…', accelerator: 'CmdOrCtrl+E', action: h.exportSvg }),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await MenuItem.new({ id: 'close', text: 'Close Board', accelerator: 'CmdOrCtrl+W', action: h.close }),
      await MenuItem.new({ id: 'quit', text: 'Quit', accelerator: 'CmdOrCtrl+Q', action: h.quit }),
    ],
  });
  const menu = await Menu.new({ items: [file] });
  await menu.setAsAppMenu();
}
