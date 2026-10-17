// src/modules/index.ts — A LISTA de módulos instalados no produto. Para retirar um módulo do
// produto inteiro, apaga-se a linha dele aqui (e a pasta). Para desligar só numa empresa, é
// `core_tenant_modules` — nada muda no código.
import { moduleRegistry } from './module.registry';
import { varejoModule } from './varejo';
import { foodModule } from './food';
import { academiaModule } from './academia';
import { servicosModule } from './servicos';

export function registerAllModules() {
  for (const m of [varejoModule, foodModule, academiaModule, servicosModule]) moduleRegistry.register(m);
}
