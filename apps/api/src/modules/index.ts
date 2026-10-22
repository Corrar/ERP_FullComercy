// src/modules/index.ts — A LISTA de módulos instalados no produto. Para retirar um módulo do
// produto inteiro, apaga-se a linha dele aqui (e a pasta). Para desligar só numa empresa, é
// `core_tenant_modules` — nada muda no código.
import { moduleRegistry } from './module.registry';
import { varejoModule } from './varejo';
import { foodModule } from './food';
import { academiaModule } from './academia';
import { servicosModule } from './servicos';
import { belezaModule } from './beleza';
import { petModule } from './pet';
import { clinicaModule } from './clinica';
import { hotelModule } from './hotel';

export function registerAllModules() {
  for (const m of [varejoModule, foodModule, academiaModule, servicosModule, belezaModule, petModule, clinicaModule, hotelModule]) moduleRegistry.register(m);
}
