// modules/varejo/index.ts — a APRESENTAÇÃO do módulo ao core. É a única coisa que o core lê.
import { ModuleKey } from '@prisma/client';
import type { ModuleDefinition } from '../module.contract';
import router from './routes/varejo.routes';
import { retailSalesStrategy } from './services/retail-sales.strategy';
import { prisma } from '../../infra/prisma';

export const varejoModule: ModuleDefinition = {
  key: ModuleKey.VAREJO,
  name: 'Varejo',
  description: 'PDV rápido, grade tamanho/cor, etiquetas e comissionamento.',
  basePath: 'varejo',
  router,
  salesStrategy: retailSalesStrategy,
  permissions: [
    { key: 'varejo.pdv:operate',      label: 'Operar PDV (abrir caixa, vender)', module: ModuleKey.VAREJO },
    { key: 'varejo.pdv:close',        label: 'Fechar caixa',                     module: ModuleKey.VAREJO },
    { key: 'varejo.grade:manage',     label: 'Gerir grades (tamanho/cor)',       module: ModuleKey.VAREJO },
    { key: 'varejo.etiquetas:print',  label: 'Gerar etiquetas',                  module: ModuleKey.VAREJO },
    { key: 'varejo.comissoes:view',   label: 'Ver comissões',                    module: ModuleKey.VAREJO },
    { key: 'varejo.comissoes:manage', label: 'Gerir vendedores e regras',        module: ModuleKey.VAREJO },
    { key: 'varejo.devolucoes:manage',label: 'Registrar devoluções e trocas',    module: ModuleKey.VAREJO },
    { key: 'varejo.relatorios:view',  label: 'Ver relatórios da loja',           module: ModuleKey.VAREJO },
  ],
  async onEnable(tenantId) {
    // Semente mínima: eixos clássicos e um modelo de etiqueta padrão.
    await prisma.retailGradeAxis.createMany({ data: [{ tenantId, name: 'Tamanho', position: 0 }, { tenantId, name: 'Cor', position: 1 }], skipDuplicates: true });
    await prisma.retailLabelTemplate.createMany({ data: [{ tenantId, name: 'Padrão 50x30', widthMm: 50, heightMm: 30, isDefault: true, layout: { campos: ['nome', 'variante', 'preco', 'barcode'] } }], skipDuplicates: true });
  },
};
